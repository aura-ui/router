import { registerComponent } from './component'

/** For path correct from subfolder (utils/misc) to the root folder (src) */
const pathPrefix = '../../'

export const loadComponent = (path: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    import(pathPrefix + path).then((exports) => {
      Object.values(exports).forEach((Component: any) => {
        const tagName = Component?.is
        if (typeof tagName === 'string') {
          registerComponent(Component)
          resolve(`<${tagName}></${tagName}>`)
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