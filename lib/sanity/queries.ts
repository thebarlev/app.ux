import { client } from './client'
import { groq } from 'next-sanity'

export interface MarketingPage {
  _id: string
  title: string
  slug: {
    current: string
  }
  sections?: Array<{
    _id: string
    _type: string
    type: string
    title: string
    content?: any[]
    image?: {
      asset: {
        _ref: string
        _type: string
      }
    }
    order?: number
  }>
  seo?: {
    metaTitle?: string
    metaDescription?: string
    ogImage?: {
      asset: {
        _ref: string
        _type: string
      }
    }
  }
  ctaButtonText?: string
  ctaButtonLink?: string
}

export interface Section {
  _id: string
  _type: string
  type: string
  title: string
  content?: any[]
  image?: {
    asset: {
      _ref: string
      _type: string
    }
  }
  order?: number
}

const marketingPageQuery = groq`
  *[_type == "marketingPage" && slug.current == $slug][0] {
    _id,
    title,
    slug,
    sections[]-> {
      _id,
      _type,
      type,
      title,
      content,
      image {
        asset {
          _ref,
          _type
        }
      },
      order
    },
    seo {
      metaTitle,
      metaDescription,
      ogImage {
        asset {
          _ref,
          _type
        }
      }
    },
    ctaButtonText,
    ctaButtonLink
  }
`

const allSectionsQuery = groq`
  *[_type == "section"] | order(order asc) {
    _id,
    _type,
    type,
    title,
    content,
    image {
      asset {
        _ref,
        _type
      }
    },
    order
  }
`

export async function getMarketingPage(slug: string = 'landing'): Promise<MarketingPage | null> {
  try {
    // Skip if projectId is not configured
    if (!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.NEXT_PUBLIC_SANITY_PROJECT_ID === 'placeholder') {
      return null
    }
    const page = await client.fetch<MarketingPage>(marketingPageQuery, { slug })
    return page || null
  } catch (error) {
    console.error('Error fetching marketing page:', error)
    return null
  }
}

export async function getAllSections(): Promise<Section[]> {
  try {
    // Skip if projectId is not configured
    if (!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.NEXT_PUBLIC_SANITY_PROJECT_ID === 'placeholder') {
      return []
    }
    const sections = await client.fetch<Section[]>(allSectionsQuery)
    return sections || []
  } catch (error) {
    console.error('Error fetching sections:', error)
    return []
  }
}

export async function getSEOData(slug: string = 'landing') {
  try {
    const page = await getMarketingPage(slug)
    return page?.seo || null
  } catch (error) {
    console.error('Error fetching SEO data:', error)
    return null
  }
}
