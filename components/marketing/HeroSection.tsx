import Link from 'next/link'
import type { Section } from '@/lib/marketing/types'

interface HeroSectionProps {
  section: Section
}

export function HeroSection({ section }: HeroSectionProps) {
  const imageUrl = section.imageUrl || null

  return (
    <section className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      {imageUrl && (
        <div className="absolute inset-0 opacity-20">
          <img
            src={imageUrl}
            alt={section.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
        <h1 className="text-5xl md:text-6xl font-bold mb-6 text-gray-900">
          {section.title}
        </h1>
        {section.content && (
          <div className="prose prose-lg max-w-none mb-8 text-gray-700">
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
    // Optional image blocks for local content
    if (block._type === 'image' && (block.url || block.src)) {
      return (
        <img
          key={index}
          src={block.url || block.src}
          alt={block.alt || ''}
          className="my-4 rounded-lg"
        />
      )
    }
    return null
  })
}
