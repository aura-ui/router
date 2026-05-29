export const getTemplate = (id: string) => {
  const template = document.getElementById(id) as HTMLTemplateElement

  if (!template) {
    throw new Error(`Template with id "${id}" not found`)
  }

  if (!(template instanceof HTMLTemplateElement)) {
    throw new Error(`Element with id "${id}" is not a template`)
  }

  return template?.content.cloneNode(true) as DocumentFragment
}
