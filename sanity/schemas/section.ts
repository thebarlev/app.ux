import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'section',
  title: 'Section',
  type: 'document',
  fields: [
    defineField({
      name: 'type',
      title: 'Section Type',
      type: 'string',
      options: {
        list: [
          { title: 'Hero', value: 'hero' },
          { title: 'Features', value: 'features' },
          { title: 'How It Works', value: 'howItWorks' },
          { title: 'Benefits', value: 'benefits' },
          { title: 'Testimonials', value: 'testimonials' },
          { title: 'FAQ', value: 'faq' },
          { title: 'CTA', value: 'cta' },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'content',
      title: 'Content',
      type: 'array',
      of: [
        {
          type: 'block',
        },
        {
          type: 'image',
          options: { hotspot: true },
        },
      ],
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'order',
      title: 'Order',
      type: 'number',
      description: 'Display order (lower numbers appear first)',
      validation: (Rule) => Rule.min(0),
    }),
  ],
  preview: {
    select: {
      title: 'title',
      type: 'type',
      order: 'order',
    },
    prepare({ title, type, order }) {
      return {
        title: title || 'Untitled Section',
        subtitle: `${type} (Order: ${order || 0})`,
      }
    },
  },
})
