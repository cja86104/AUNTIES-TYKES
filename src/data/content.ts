/**
 * Real site content — NOT demo data.
 *
 * These two lists are shipped content the app reads in live mode: the document
 * categories the owner files uploads under, and the published FAQ. They lived
 * in `mockData.ts` while the whole app ran on fixtures, which meant deleting
 * the demo dataset would have taken working pages down with it. They belong
 * here so `src/data/mockData.ts` can be removed outright once `DEMO_MODE` goes.
 *
 * Edit freely — nothing in this file is placeholder text.
 */
import type { DocumentCategory, Faq } from '../types'

export const documentCategories: DocumentCategory[] = ['Handbooks', 'Policies', 'Forms', 'Menus', 'Calendars']

export const faqs: Faq[] = [
  { q: 'What are your hours?', a: 'We are open Monday through Friday, 7:00 AM to 5:45 PM. Drop-off closes at 9:30 AM so we can start our morning rhythm without interruptions.' },
  { q: 'What should we pack each day?', a: 'A labeled water bottle, two full changes of clothes (three during potty learning), diapers/wipes if needed, a crib sheet and small blanket for nap, and weather-appropriate outerwear. We provide all meals and snacks.' },
  { q: 'Do you provide meals?', a: 'Yes. Breakfast, a hot lunch, and an afternoon snack are all included and posted on a monthly menu. We are a peanut-free house and can accommodate most dietary needs with a note from you.' },
  { q: 'How does nap time work?', a: 'Infants sleep on their own schedule in safe-sleep certified cribs. Toddlers and preschoolers rest from about 12:45 to 2:30. Non-sleepers get quiet books and puzzles on their mat after 45 minutes.' },
  { q: 'How do you handle potty training?', a: 'We follow your lead and start when your child shows readiness. Bathroom visits happen after meals and before nap, and accidents are treated as a normal part of learning.' },
  { q: 'What is your sick policy?', a: 'Children need to stay home with a fever of 100.4°F or higher, vomiting or diarrhea, an undiagnosed rash, or draining eyes. They may return 24 hours after symptoms resolve without medication.' },
  { q: 'Are you insured?', a: 'Yes — we carry liability insurance, and every adult in the home has a cleared background check plus current CPR and First Aid.' },
  { q: 'How do we get updates during the day?', a: 'Every family gets a parent portal login for daily reports — meals, naps, diapers, mood, and activities. Announcements and invoices live there too.' },
  { q: 'Is there a waitlist?', a: 'Usually, yes. We keep 12 spots total. Join the waitlist through the contact form and we will tell you honestly where you stand and when we expect an opening.' },
  { q: 'Do you offer part-time care?', a: 'We offer part-time (three fixed days) and occasional drop-in care when a spot is available. Full-time families always get first choice of schedule.' },
]
