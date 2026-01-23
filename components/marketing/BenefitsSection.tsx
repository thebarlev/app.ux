import type { Section } from '@/lib/sanity/queries'

interface BenefitsSectionProps {
  section: Section
}

export function BenefitsSection({ section }: BenefitsSectionProps) {
  return (
    <section className="py-20 px-4 bg-white">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-4xl font-bold text-center mb-12 text-gray-900">
          {section.title}
        </h2>
        {section.content && (
          <div className="prose prose-lg max-w-none text-center text-gray-700">
            {renderContent(section.content)}
          </div>
        )}
      </div>
    </section>
  )
}

function renderContent(content: any[]): React.ReactNode {
  if (!content || !Array.isArray(content)) return null

  return content.map((block, index) => {
    if (block._type === 'block') {
      return (
        <p key={index} className="mb-4">
          {block.children?.map((child: any, childIndex: number) => {
            if (child.marks?.includes('strong')) {
              return <strong key={childIndex}>{child.text}</strong>
            }
            if (child.marks?.includes('em')) {
              return <em key={childIndex}>{child.text}</em>
            }
            return <span key={childIndex}>{child.text}</span>
          })}
        </p>
      )
    }
    return null
  })
}
