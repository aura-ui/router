import { registerComponent } from './component'

const sleep = (time: number) => new Promise(resolve => setTimeout(resolve, time))

export const sanitizeHtml = (html: string) => {
  const $template = document.createElement('template')
  $template.innerHTML = html
  return $template.content.cloneNode(true)
}

export const loadContent = async (url: string, signal: AbortSignal): Promise<string> => {
  const response = await fetch(url, { signal })
  if (!response.ok) return ''

  await sleep(1000)

  return await response.text()
}

/** For path correct from subfolder (utils/misc) to the root folder (src) */
const pathPrefix = '../../'

export const loadAndRegisterComponent = (path: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    import(pathPrefix + path).then((exports) => {
      Object.values(exports).forEach((Component: any) => {
        const tagName = Component?.is
        if (typeof tagName === 'string') {
          registerComponent(Component)
          resolve(tagName)
        } else {
          reject(`Not found [IS] property inside the component: ${path}`)
        }
      })
      return exports
    }).catch((err) => {
      reject(err)
    })
  })
}