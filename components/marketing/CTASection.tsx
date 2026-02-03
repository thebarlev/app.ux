import Link from 'next/link'
import type { Section } from '@/lib/marketing/types'

interface CTASectionProps {
  section: Section
}

export function CTASection({ section }: CTASectionProps) {
  return (
    <section className="py-20 px-4 bg-gradient-to-r from-blue-600 to-indigo-700">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-4xl font-bold mb-6 text-white">
          {section.title}
        </h2>
        {section.content && (
          <div className="prose prose-lg max-w-none mb-8 text-blue-100">
            {renderContent(section.content)}
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/login"
            className="inline-block px-8 py-4 bg-white text-blue-600 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
          >
            התחברות
          </Link>
          <Link
            href="/register"
            className="inline-block px-8 py-4 bg-transparent border-2 border-white text-white rounded-lg font-semibold hover:bg-white hover:text-blue-600 transition-colors"
          >
            הרשמה
          </Link>
        </div>
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
