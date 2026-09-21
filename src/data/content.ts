/**
 * Static site content.
 *
 * These two lists are shipped content the app reads at runtime: the document
 * categories the owner files uploads under, and the published FAQ. They are
 * static because neither is owner-editable yet — if either becomes editable,
 * it moves into the settings row rather than growing a table of its own.
 */
import type { DocumentCategory, Faq } from '../types'

export const documentCategories: DocumentCategory[] = ['Handbooks', 'Policies', 'Forms', 'Menus', 'Calendars']

export const faqs: Faq[] = [
  { q: 'How do we find out about availability?', a: 'Tell us about your family through the contact form and we will contact you with availability.' },
]
