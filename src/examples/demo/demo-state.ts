/** Demo-only mutable state shared between hooks and main.ts */
export let demoAuthEnabled = false;

export function setDemoAuth(enabled: boolean): void {
  demoAuthEnabled = enabled;
}
