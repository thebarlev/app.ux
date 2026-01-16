import { getMarketingPage } from '@/lib/sanity/queries'
import { SectionRenderer } from '@/components/marketing/SectionRenderer'
import { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const page = await getMarketingPage('landing')
  
  if (page?.seo) {
    const ogImage = page.seo.ogImage?.asset?._ref
      ? `https://cdn.sanity.io/images/${process.env.NEXT_PUBLIC_SANITY_PROJECT_ID}/${process.env.NEXT_PUBLIC_SANITY_DATASET}/${page.seo.ogImage.asset._ref.replace('image-', '').replace('-jpg', '.jpg').replace('-png', '.png')}`
      : undefined

    return {
      title: page.seo.metaTitle || page.title,
      description: page.seo.metaDescription,
      ...(ogImage && {
        openGraph: {
          title: page.seo.metaTitle || page.title,
          description: page.seo.metaDescription,
          images: [{ url: ogImage }],
        },
      }),
    }
  }

  return {
    title: page?.title || 'Landing Page',
    description: 'Welcome to our platform',
  }
}

export default async function LandingPage() {
  const page = await getMarketingPage('landing')

  if (!page) {
    return (
      <main dir="rtl" className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">עמוד שיווקי</h1>
          <p className="text-gray-600">אין תוכן זמין כרגע. אנא הוסף תוכן דרך Sanity Studio.</p>
        </div>
      </main>
    )
  }

  const sortedSections = page.sections
    ? [...page.sections].sort((a, b) => (a.order || 0) - (b.order || 0))
    : []

  return (
    <main dir="rtl" className="min-h-screen bg-white">
      {sortedSections.length > 0 ? (
        sortedSections.map((section) => (
          <SectionRenderer key={section._id} section={section} />
        ))
      ) : (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">{page.title}</h1>
            <p className="text-gray-600 mb-6">אין סעיפים להצגה כרגע.</p>
            {page.ctaButtonText && page.ctaButtonLink && (
              <a
                href={page.ctaButtonLink}
                className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {page.ctaButtonText}
              </a>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
