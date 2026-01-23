import { HeroSection } from './HeroSection'
import { FeaturesSection } from './FeaturesSection'
import { HowItWorksSection } from './HowItWorksSection'
import { BenefitsSection } from './BenefitsSection'
import { TestimonialsSection } from './TestimonialsSection'
import { FAQSection } from './FAQSection'
import { CTASection } from './CTASection'
import type { Section } from '@/lib/sanity/queries'

interface SectionRendererProps {
  section: Section
}

export function SectionRenderer({ section }: SectionRendererProps) {
  switch (section.type) {
    case 'hero':
      return <HeroSection section={section} />
    case 'features':
      return <FeaturesSection section={section} />
    case 'howItWorks':
      return <HowItWorksSection section={section} />
    case 'benefits':
      return <BenefitsSection section={section} />
    case 'testimonials':
      return <TestimonialsSection section={section} />
    case 'faq':
      return <FAQSection section={section} />
    case 'cta':
      return <CTASection section={section} />
    default:
      return (
        <div className="py-12 px-4">
          <h2 className="text-2xl font-bold mb-4">{section.title}</h2>
          <p className="text-gray-600">Unknown section type: {section.type}</p>
        </div>
      )
  }
}
