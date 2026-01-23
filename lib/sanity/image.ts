import imageUrlBuilder from '@sanity/image-url'
import { client } from './client'

const builder = imageUrlBuilder(client)

export function urlForImage(source: {
  asset?: {
    _ref?: string
    _type?: string
  }
}): string {
  if (!source?.asset?._ref) {
    return ''
  }

  return builder.image(source).width(1200).height(800).fit('max').auto('format').url()
}
