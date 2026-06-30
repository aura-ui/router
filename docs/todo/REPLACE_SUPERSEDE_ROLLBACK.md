# TODO: replace-only supersede и `revertInFlightView`

> **Статус:** задокументировано, не реализовано  
> **Код:** `outlet.ts` (`rollbackStaged`, `mergeMount`), `view-controller.ts` (`revertInFlightView`), `view-rollback.ts`  
> **См. также:** commit gate в `commit-gate.ts`, `NavigationPlanner` (`cancel-pending`)

---

## Контекст

Outlet strategies:

| Strategy | Когда | DOM |
|----------|--------|-----|
| `replace` | Нет transition package (`useStagedMount === false`) | один view root → можно `patch` inner content |
| `stage` | `route.transition.order !== null` | два root в outlet → crossfade in/out |
| `patch` | тот же root | обновление содержимого без второго слоя |

`useStagedMount` включается только при transition (`render-pass.ts` → `route.transition.order !== null`).

**Принцип:** `stage` = два видимых слоя для анимации. `replace` = один слой для patch и мгновенной смены. Не смешивать.

---

## Что делает `revertInFlightView`

```text
rollbackStaged(mount)     — DOM restore (только strategy === 'stage')
renderSignal.cancel()     — abort in-flight fetch/render
clearViewPresentation()   — сброс opacity/transform/Web Animations
```

| Часть | Без transition | С transition (stage) |
|-------|----------------|----------------------|
| `rollbackStaged` | no-op | **главный смысл** — restore outgoing |
| `renderSignal.cancel()` | **нужен** (abort fetch) | нужен |
| `clearViewPresentation` | почти no-op | cancels fade/slide styles |

**Вывод:** полный DOM-revert нужен из‑за **stage и анимаций**. Без transition replace мгновенный — outgoing handle при mount не сохраняется.

---

## Поведение по фазам

### С transition (stage)

```text
render → stage (old + new in DOM)
transitionOut / transitionIn → hooks
supersede → revertInFlightView → cancelStage, outgoing restored
commit gate → commitStagedView (promote staged → single root)
→ history + prev
→ left / after
```

Полный DOM rollback — **основной сценарий**. Demo с fade/slide покрыт.

### Без transition (replace)

```text
guards → load → render (await fetch) → replace (old destroyed in DOM)
→ runAfterRender:
    commitEnterViews (no-op для replace)
    commit gate (history + prev)
    left / after
```

| Момент supersede | Экран | `revertInFlightView` |
|------------------|-------|----------------------|
| Во время fetch/load (**до mount**) | старый view | `renderSignal.cancel()` — достаточно (**типичный cancel**) |
| **После replace, до commit gate** | уже новый view | `rollbackStaged` — **no-op** (**редкий race**, не «окно для клика») |
| После commit gate | committed | rollback не вызывается |

---

## Архитектурный gap (replace-only)

> **Важно:** это **не частый UX-баг**, а **редкий архитектурный edge case**. В нормальном сценарии replace-route пользователь **не попадает** в окно между replace и commit gate — см. ниже «Практическая редкость».

**Суть gap:** если DOM уже переключили через **`replace`**, а commit gate **по какой-то причине не прошёл**, откатить **экран** назад нельзя — outgoing root уничтожен, `rollbackStaged` для replace — no-op. URL/prev при этом могут остаться корректными (about), а экран — gallery.

**Условия (все нужны):**

| # | Условие |
|---|---------|
| 1 | Route **без transition** → strategy `replace` |
| 2 | **`replace` уже произошёл** в render |
| 3 | Commit gate **не вызван** (job cancelled / superseded / race) |
| 4 | Срабатывает `revertInFlightView` → `rollbackStaged` no-op |

**Что gap НЕ означает:** «долгий fetch даёт время отменить после смены экрана». Наоборот: долгий fetch даёт время отменить **до** replace, когда DOM ещё старый — и там всё работает.

---

### Практическая редкость

На replace-route (без transition) `replace` и `commitGate` идут **подряд без `await`** в одном продолжении после завершения fetch:

```text
processor-pipeline.ts:
  runRenderWithTransition → runRender     // fetch → replace
  runAfterRender          → commitGate()  // сразу после, sync
```

Между `replaceChildren` и `applyCommitGate` **нет yield** — пользовательский клик (macrotask) **не вклинится**. Окно — microtask-уровень, не «пока грузится html».

| Когда | Что происходит |
|-------|----------------|
| **Fetch in flight** | DOM старый; cancel/supersede **безопасны** — gap не проявляется |
| **Fetch завершился, replace + gate в одном tick** | Нормальный путь; всё согласовано |
| **Abort после replace, gate не прошёл** | Теоретический gap; на практике **очень редко** (race, nested routes, искусственный abort в тесте) |

**Вывод:** gap **задокументирован** и **осознан** как tradeoff replace vs stage. Реализовывать detached snapshot fix — **не срочно**, пока нет воспроизводимого бага в prod.

---

### Сводка: кто что «думает» в конце gap (шаг 7)

| Слой | Состояние | Ожидание пользователя |
|------|-----------|------------------------|
| **DOM / outlet** | виден контент **gallery** | контент **about** (отменил переход) |
| **Адресная строка** | `/about` (cancelled push → `preserve`) | `/about` ✓ |
| **engine.prev** | matched route **about** | about ✓ |
| **CommitTracker** | не `committed` (gate не был) | — |
| **Processor result** | `{ status: 'cancelled' }` | — |
| **Gallery job** | aborted | — |

**Рассинхрон:** URL и `prev` согласованы с about, **экран показывает gallery**. Пользователь «отменил» gallery, но visually остался на gallery.

---

### Пошагово: в чём gap на каждом шаге

#### Шаг 1 — Committed: `/about`

```text
outlet:      [ data-aura-view-root → «About page» ]
URL:         /about
engine.prev: MatchedRouteInfo для /about
planner:     pendingHref = null
job:         нет активного
```

Все слои **согласованы**: committed state = то, что видит пользователь.

**Предусловие для gap:** route `/gallery` **без** `data-crossfade` / transition hooks → при render будет `replace`, не `stage`.

---

#### Шаг 2 — Клик `/gallery`, navigation in flight

```text
planner:     plan = run → markPending('/gallery')
processor:   jobManager.begin() → job #1
transaction: from = about, to = gallery
pipeline:    leave → enter → load → render (начало)
```

Внутри **render** (async):

```text
content.resolve('/gallery')  // html-src, fetch — может занять 100–500ms+
DOM:         всё ещё about   ← пользователь видит about
URL:         /about
prev:        about
```

Пока fetch **не завершился**, supersede или `cancel-pending` **безопасны**:

- `renderSignal.cancel()` прерывает load;
- DOM не менялся;
- `revertInFlightView` → `rollbackStaged` no-op, но **это нормально** — откатывать нечего.

**Gap ещё не начался.**

---

#### Шаг 3 — Fetch завершился, `replace` в DOM

```text
mountContent(ctx, galleryPayload)
  → resolveStageStrategy: useStagedMount=false → 'replace'
  → outlet.applyReplace(galleryRoot)
       replaceChildren(galleryRoot)   // about root удалён из дерева
       activeRoot = galleryRoot

mergeMount:
  strategy = 'replace'
  activeHandle = gallery handle
  stageOutgoingHandle = null         // для replace outgoing НЕ сохраняется
```

| Слой | После шага 3 |
|------|----------------|
| **DOM** | только gallery root — **about физически уничтожен** (не detach, не второй слой) |
| **URL** | `/about` (pushState ещё не было) |
| **prev** | about |
| **CommitTracker** | `markViewStaged()` после render — имя «staged», но для replace **нет второго слоя** |
| **Пользователь** | **уже видит gallery**, хотя «официально» ещё on about |

**Точка невозврата для replace:** outgoing handle потерян. Если abort случится **после** replace, но **до** gate — откатить DOM некуда. На практике gate обычно следует **сразу** (шаг 4).

**Почему так устроено replace:** один `activeRoot` в outlet — prerequisite для **`patch`**. `applyReplace` не может оставить old sibling в DOM — это был бы stage.

---

#### Шаг 4 — Commit gate (обычно сразу после replace)

В **нормальном** сценарии `runAfterRender` вызывается **в том же event-loop turn**, что и replace:

```text
runRender          ✓ gallery в DOM
runAfterRender     (следующий pipeline step, без await между ними):
  isJobActive()?   ✓
  commitEnterViews → commitStagedView() для replace = NO-OP
  commitGate()     ✓ pushState, prev = gallery  ← обычно здесь же
```

Gap **открывается** только если gate **не дошёл** — job abort/supersede **между** replace и gate (см. шаги 5–6). Это **не** «долгое окно для клика», а узкий race.

**Если gate не прошёл (редкий case):**

| Действие | Статус |
|----------|--------|
| `pushState('/gallery')` | нет |
| `engine.prev = gallery` | нет |
| `onNavigationCommitted` | нет |
| `left` / `after` | нет |

DOM уже gallery (шаг 3), committed state ещё about — **архитектурный рассинхрон**, который rollback replace не закрывает.

---

#### Шаг 5 — Supersede или cancel-pending (типично **во время fetch**, шаг 2)

**Вариант A — active link `/about`** пока gallery **ещё грузится**:

```text
planner.plan('/about'):
  sameCommittedTarget ✓, pendingHref='/gallery' ≠ '/about'
  → action: 'cancel-pending'

engine:
  abortPendingNavigation()  // job #1.abort()
  return                    // новый processor НЕ запускается
```

**Намерение:** пользователь остаётся на about; gallery navigation отменена. **DOM не менялся** — gap не проявляется.

**Вариант B — клик `/security`** (supersede, тоже обычно **до replace**):

```text
planner.plan → run
processor.begin()  // abort job #1, job #2 стартует
```

**Намерение:** gallery отменена, начать security.

**Gap-вариант (редко):** abort **после** replace (шаг 3), **до** gate (шаг 4). Тогда шаги 6–7 ниже — теоретический исход.

---

#### Шаг 6 — Rollback pipeline (только если gap-case из шага 5)

```text
rollbackCancelledNavigation(plan, commitTracker)
  commitTracker.isViewCommitted() → false  (gate не был)
  для enter/exit routes:
    route.revertInFlightView()
```

Внутри `revertInFlightView` на **gallery route** (replace mount):

```text
rollbackStaged(mount)
  mount.strategy === 'replace'  →  return snapshot unchanged  // NO-OP

renderSignal.cancel()             →  ok, но render уже завершён

clearViewPresentation()           →  сброс styles на gallery root (если были)
```

**Что rollback НЕ делает:**

- не восстанавливает about root (уничтожен на шаге 3);
- не вызывает `left` / teardown gallery view в outlet;
- не трогает URL (это делает finalize ниже).

Processor gallery job возвращает `{ status: 'cancelled' }`.

```text
finalizeProcessorNavigation(cancelled)
  history policy: push + cancelled → 'preserve'
  → pushState НЕ вызывается, URL остаётся /about
  setPrev: не меняется → prev = about
```

**Rollback engine-слоя корректен:** URL и prev = about. **View-слой не откатан.**

---

#### Шаг 7 — Итог (теоретический, если gap-case)

```text
Экран:     «Gallery page» HTML (gallery root в outlet)
URL:       /about
prev:      about
Статус:    gallery navigation cancelled — пользователь «не уходил» с about
```

**Теоретический баг UX:** логически gallery отменена, визуально gallery остался. На replace-route **поймать это кликом сложно** — cancel-pending во время fetch (шаг 2) как раз **безопасен**.

**Почему это не «просто history bug»:** history **правильный** (`preserve`). Ломается **только DOM** — rollback replace не реализован.

**Почему cancel-pending не спасает (если gap всё же случился):** abort job и preserve history — **правильно для engine**. Не хватает **view rollback для replace** в `rollbackStaged`.

---

### Диаграмма времени (replace route)

```text
about committed
    │
    ├─ click /gallery
    │
    ├─ [ SAFE, долго может длиться ] fetch … DOM=about
    │       ↑ cancel / supersede здесь — OK
    │
    ├─ fetch done → replace + commitGate (обычно один tick) → consistent ✓
    │
    └─ [ RARE ] replace → abort до gate (race) → rollback DOM fails
                              URL/prev=about, экран=gallery ✗
```

При **stage** (transition) между render и gate — **два root** в DOM; abort вызывает `cancelStage` + restore outgoing — replace-gap не актуален.

---

### Краткий сценарий (reference, теоретический)

```text
1. Committed: /about
2. Клик /gallery — fetch in flight, DOM = about          ← cancel безопасен
3. replace — about уничтожен, DOM = gallery
4. (редко) gate не прошёл — abort/race до applyCommitGate
5. revertInFlightView — rollbackStaged no-op на replace
6. URL/prev = about, экран = gallery                     ← рассинхрон
```

В шаге 4 **нормально** gate проходит сразу после replace — тогда шаги 5–6 не наступают.

---

### Почему stage этого не имеет

При transition `mergeMount` сохраняет outgoing **в DOM**:

```typescript
// outlet.ts — mergeMount
stageOutgoingHandle: slice.appliedStrategy === 'stage' ? snapshot.activeHandle : null,
```

- **stage:** в outlet два root — old (outgoing) + new (staged incoming)
- **rollbackStaged:** `cancelStage()` убирает incoming, `activeHandle = stageOutgoingHandle`

При **replace** `AuraOutlet.applyReplace`:

```typescript
// aura-outlet.ts
this.replaceChildren(root);  // старые children удалены
this.activeRoot = root;
```

`stageOutgoingHandle = null`. Откат некуда.

---

## Почему не «всегда stage» (отклонённый вариант)

В рефакторинге commit gate рассматривался вариант: stage при любом непустом outlet (`children.length > 0`).

**Отклонено**, потому что stage = **два слоя в DOM**:

- ломает **patch** — нужен один `activeRoot` в outlet (`applyPatch` обновляет inner content существующего root);
- без анимации — лишний flash двух root;
- semantically stage только для **двух кадров** crossfade.

Gap на replace — **осознанный tradeoff** ради replace + patch. Transition routes защищены stage.

---

## Когда gap не проявляется (типичные случаи)

| Ситуация | Почему ок |
|----------|-----------|
| **99% replace navigations** | replace + commitGate в одном sync turn после fetch |
| Route **с transition** (demo fade) | stage + `rollbackStaged` |
| Cancel/supersede **во время fetch** | DOM ещё old; abort signal достаточен |
| Navigation **дошла до commit gate** | URL, prev, DOM согласованы |

**Медленный `html-src`** даёт большое окно для cancel **до** replace, не после. После replace gate почти мгновенный.

---

## Что не ломается сейчас

- Demo с fade/slide (`data-crossfade`) — stage + revert
- `NavigationPlanner` + `cancel-pending` (active link abort job)
- Commit gate — history/prev только после победы job
- Abort во время async load на replace routes (DOM не менялся)

---

## Предлагаемый fix: detached snapshot (без второго слоя)

Не возвращать «всегда stage». Вместо этого — **не уничтожать outgoing сразу**, держать **detached** копию до commit gate **без второго child в outlet**.

### Сейчас (replace)

```text
outlet:  [ about root ]  → replace →  [ gallery root ]
                                    about destroyed ↑
```

### Целевое поведение

```text
перед replace:
  pendingOutgoing = activeHandle.detach()   // subtree в памяти, не в outlet

outlet после replace:
  [ gallery root ]                          // один visible слой — patch возможен

при supersede / guard cancel (до gate):
  incomingHandle.destroy()
  reattach(pendingOutgoing) → outlet снова shows about
  pendingOutgoing = null

при commit gate (успех):
  pendingOutgoing.destroy()                 // committed — старый больше не нужен
  pendingOutgoing = null
```

### Изменения модели (концепт)

```typescript
type MountSnapshot = {
  strategy: 'replace' | 'stage';
  activeHandle: ViewHandle | null;
  stageOutgoingHandle: ViewHandle | null;   // stage: outgoing still in DOM
  pendingOutgoingRoot: ViewRoot | null;      // replace TODO: detached, off-screen
  nestedOutlet: AuraOutlet | null;
};
```

В `mergeMount` при `appliedStrategy === 'replace'` и наличии `snapshot.activeHandle`:

```typescript
// pseudo
const detached = snapshot.activeHandle.detach();
// затем mount incoming через replace как сейчас
return {
  ...
  pendingOutgoingRoot: detached,
  stageOutgoingHandle: null,
};
```

Новая функция `rollbackReplace` (или расширение `revertInFlightView` / `rollbackStaged`):

```typescript
// pseudo
if (snapshot.pendingOutgoingRoot) {
  snapshot.activeHandle?.destroy();
  reattachContent(ctx, snapshot.pendingOutgoingRoot);
  return { ...snapshot, pendingOutgoingRoot: null, strategy: 'replace' };
}
```

На commit gate для replace (в `commitStagedView` или отдельный discard):

```typescript
snapshot.pendingOutgoingRoot?.remove(); // или destroy handle
pendingOutgoingRoot = null;
```

### Stage vs detached snapshot

| | **stage** (transition) | **detached snapshot** (replace TODO) |
|---|------------------------|--------------------------------------|
| DOM во время pending | 2 root **в outlet** | 1 root в outlet |
| Видимость | оба (crossfade) | только incoming |
| Patch на тот же root | нет | **да** (один activeRoot) |
| Rollback | `cancelStage` + outgoing in DOM | reattach detached |
| Память | outgoing в DOM | outgoing в detached subtree |
| Когда | transition package | replace-only, если нужен DOM rollback |

---

## Связь с commit gate

Commit gate (`applyCommitGate` в processor `runAfterRender` / reenter):

| | replace (сейчас) | stage |
|---|------------------|-------|
| DOM на render | уже «новый» | staged, old visible |
| `commitEnterViews` | no-op | promote staged |
| gate | history + prev + callbacks | history + prev + callbacks |

Snapshot закрывает дыру **между render и gate** для replace:

- логически committed = about (prev, cancelled history);
- DOM временно gallery;
- при abort — **вернуть about из detached**, не ломая URL (cancelled → history `preserve`).

---

## Edge cases при реализации

1. **keep-alive / `preserve.view`** — outgoing уже умеет `detach()` для view cache; не путать pending snapshot с cache entry (разные lifecycle, discard на gate vs put в cache на `onLeft`).

2. **Nested routes (layout + content)** — несколько `enterRoutes`, snapshot может понадобиться на каждый replace mount point (свой `RouteViewController` / `MountSnapshot`).

3. **Layout route** — replace на nested outlet vs app outlet; snapshot per outlet.

4. **Render error recovery** — error UI mounted via replace: политика discard pending vs restore outgoing.

5. **Память** — destroy detached root на gate success **обязателен**, иначе leak при каждой navigation.

6. **Reenter / same-target** — обычно без replace mount; snapshot не затронут.

7. **Первый mount** (пустой outlet) — replace без outgoing; `pendingOutgoingRoot = null`.

---

## Файлы для изменений

| Файл | Изменение |
|------|-----------|
| `aura-route/core/view/outlet.ts` | `MountSnapshot.pendingOutgoingRoot`, `mergeMount`, `rollbackReplace`, discard на commit |
| `aura-route/core/view/view-controller.ts` | `revertInFlightView` вызывает rollback replace path |
| `aura-route/core/view/outlet.ts` | `commitStaged` / отдельный `discardPendingOutgoing` для replace gate |
| `aura-routing-engine/.../view-rollback.ts` | комментарий / без изменений логики |
| tests | искусственный abort между render и gate: DOM restored, history preserve |

---

## Когда имеет смысл реализовать

| | |
|---|---|
| **Не срочно (сейчас)** | Gap архитектурный и на практике редкий; transitions покрыты stage; cancel во время fetch работает |
| **Стоит сделать** | Появился **воспроизводимый** prod-баг; nested layout+content с partial replace; нужна строгая корректность rollback в тестах |
| **Не делать** | «Всегда stage» — регрессия patch и семантики двух слоёв |

---

## Связанные решения (уже в коде)

- `useStagedMount` только при transition — `resolveStageStrategy` + `render-pass.ts`
- Commit gate — history + `prev` в `applyCommitGate`; DOM promote через `commitEnterViews` для stage
- `NavigationPlanner` — `cancel-pending` abort job (но без DOM restore на replace)
- TODO-комментарий в коде: блок над `rollbackStaged` в `outlet.ts`
