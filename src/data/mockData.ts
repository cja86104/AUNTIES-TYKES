import { subDays, addDays, getDay, format } from 'date-fns'
import type {
  Announcement,
  AttendanceRecord,
  Child,
  DailyLog,
  DocumentCategory,
  DocumentRecord,
  Faq,
  Family,
  GalleryItem,
  Invoice,
  Lead,
  LogPhoto,
  Program,
  RevenuePoint,
  Settings,
  TeamMember,
  Testimonial,
  Thread,
  User,
  WaitlistProspect,
} from '../types'

const today = new Date()
const iso = (d: Date) => format(d, 'yyyy-MM-dd')

export const settings: Settings = {
  businessName: 'Aunties Tykes',
  tagline: 'A small, licensed home daycare where every child is known by name.',
  director: 'Rosalind “Auntie Roz” Hayes',
  address: '412 Chestnut Row, Durham, NC 27705',
  phone: '(919) 555-0134',
  email: 'hello@auntiestykes.com',
  hours: 'Monday – Friday · 7:00 AM – 5:45 PM',
  licenseNumber: 'NC-FCCH-118427',
  capacity: 12,
  ratios: 'Infants 1:3 · Toddlers 1:4 · Preschool 1:6',
  rates: {
    fullTime: 265,
    partTime: 175,
    dropIn: 62,
    registrationFee: 150,
    lateFeePerMinute: 2,
    siblingDiscountPct: 10,
  },
  policies: {
    sick: `**Please keep your child home** if they have any of the following in the last 24 hours:

- Fever of 100.4°F or higher
- Vomiting or diarrhea (two or more episodes)
- An undiagnosed rash, or eyes that are red and draining
- A persistent cough that keeps them from resting

Children may return **24 hours after symptoms resolve without medication**. If your child becomes ill during the day we will call you right away and keep them comfortable in our quiet nook until pickup.`,
    latePickup: `Our licensed day ends at **5:45 PM**. We understand traffic happens — please text as soon as you know you'll be late.

- A grace period of 10 minutes is offered twice per calendar year
- After that, a late fee of **$2 per minute** is added to your next invoice
- Children not picked up by 6:30 PM with no contact require us to call your emergency contacts`,
    holidays: `Aunties Tykes closes for **10 paid holidays** plus one week of deep-clean and training in August. Tuition is not prorated for these planned closures.

- New Year's Day · MLK Day · Memorial Day
- Juneteenth · Independence Day · Labor Day
- Thanksgiving (Thu + Fri) · Dec 24 – Dec 26

A printable calendar is posted in the Documents area of your parent portal each December.`,
    potty: `We follow your lead. When you feel your toddler is showing readiness we start a gentle rhythm together — bathroom visits after meals and before nap, plenty of spare clothes, and zero shame about accidents.

Please pack **three full changes of clothes** during the learning weeks.`,
  },
}

export const users: User[] = [
  {
    id: 'u1',
    name: 'Rosalind Hayes',
    email: 'auntie@auntiestykes.com',
    password: 'tykes2024',
    role: 'admin',
    title: 'Owner & Director',
  },
  { id: 'u2', name: 'Maya Brooks', email: 'maya@example.com', password: 'parent123', role: 'parent', familyId: 'f1' },
  { id: 'u3', name: 'Daniel Okafor', email: 'daniel@example.com', password: 'parent123', role: 'parent', familyId: 'f2' },
  { id: 'u4', name: 'Sofia Reyes-Lin', email: 'sofia@example.com', password: 'parent123', role: 'parent', familyId: 'f3' },
]

export const families: Family[] = [
  {
    id: 'f1',
    name: 'Brooks Family',
    primaryContact: 'Maya Brooks',
    relation: 'Mother',
    email: 'maya@example.com',
    phone: '(919) 555-0142',
    address: '218 Larkspur Lane, Durham, NC 27705',
    secondary: { name: 'Andre Brooks', relation: 'Father', phone: '(919) 555-0188' },
    emergency: [
      { name: 'Gwen Brooks', relation: 'Grandmother', phone: '(919) 555-0119' },
      { name: 'Tasha Neal', relation: 'Aunt', phone: '(919) 555-0177' },
    ],
    joinedAt: '2023-08-14',
    notes: 'Prefers text updates. Andre handles Friday pickups.',
  },
  {
    id: 'f2',
    name: 'Okafor Family',
    primaryContact: 'Daniel Okafor',
    relation: 'Father',
    email: 'daniel@example.com',
    phone: '(919) 555-0263',
    address: '77 Willowbrook Ct, Durham, NC 27707',
    secondary: { name: 'Ifeoma Okafor', relation: 'Mother', phone: '(919) 555-0271' },
    emergency: [{ name: 'Chidi Okafor', relation: 'Uncle', phone: '(984) 555-0110' }],
    joinedAt: '2024-01-08',
    notes: 'Amara needs her own labeled bottles kept in the door of the fridge.',
  },
  {
    id: 'f3',
    name: 'Reyes-Lin Family',
    primaryContact: 'Sofia Reyes-Lin',
    relation: 'Mother',
    email: 'sofia@example.com',
    phone: '(984) 555-0325',
    address: '1901 Foxglove Ave, Durham, NC 27705',
    secondary: { name: 'Wei Lin', relation: 'Father', phone: '(984) 555-0344' },
    emergency: [
      { name: 'Marta Reyes', relation: 'Grandmother', phone: '(984) 555-0388' },
      { name: 'Jordan Pace', relation: 'Family friend', phone: '(919) 555-0400' },
    ],
    joinedAt: '2024-06-03',
    notes: 'Bilingual household — Nico loves being read to in Spanish.',
  },
]

export const children: Child[] = [
  {
    id: 'c1',
    familyId: 'f1',
    name: 'Ellie Brooks',
    dob: '2023-04-11',
    ageGroup: 'Toddler',
    status: 'active',
    plan: 'Full-time',
    startDate: '2023-09-05',
    teacher: 'Auntie Roz',
    allergies: ['Strawberries (mild hives)'],
    medications: [],
    notes: 'Naps best with the yellow blanket. Loves the sensory bin.',
    hue: 'from-[#4F77D9] to-[#7DA0F0]',
  },
  {
    id: 'c2',
    familyId: 'f1',
    name: 'Miles Brooks',
    dob: '2020-11-02',
    ageGroup: 'Preschool',
    status: 'active',
    plan: 'Full-time',
    startDate: '2023-09-05',
    teacher: 'Ms. Deb',
    allergies: [],
    medications: ['Albuterol inhaler (as needed, on file)'],
    notes: 'Writing his name independently. Big helper at cleanup.',
    hue: 'from-[#5DC4A6] to-[#8FE0C9]',
  },
  {
    id: 'c3',
    familyId: 'f2',
    name: 'Amara Okafor',
    dob: '2024-10-19',
    ageGroup: 'Infant',
    status: 'active',
    plan: 'Full-time',
    startDate: '2025-02-03',
    teacher: 'Auntie Roz',
    allergies: [],
    medications: [],
    notes: 'Bottles every 3 hours. Rolling both directions now.',
    hue: 'from-[#F5B942] to-[#F9D28A]',
  },
  {
    id: 'c4',
    familyId: 'f2',
    name: 'Zion Okafor',
    dob: '2022-07-28',
    ageGroup: 'Toddler',
    status: 'active',
    plan: 'Part-time (M/W/F)',
    startDate: '2024-01-15',
    teacher: 'Ms. Deb',
    allergies: ['Peanuts (EpiPen on site)'],
    medications: ['EpiPen Jr.'],
    notes: 'Peanut-free table. Loves the water table and trucks.',
    hue: 'from-[#E86A6A] to-[#F49C9C]',
  },
  {
    id: 'c5',
    familyId: 'f3',
    name: 'Nico Reyes-Lin',
    dob: '2021-03-16',
    ageGroup: 'Preschool',
    status: 'active',
    plan: 'Full-time',
    startDate: '2024-06-10',
    teacher: 'Ms. Priya',
    allergies: [],
    medications: [],
    notes: 'Reading readiness group. Bilingual — Spanish at home.',
    hue: 'from-[#8B6ED9] to-[#B49CEE]',
  },
  {
    id: 'c6',
    familyId: 'f3',
    name: 'Luna Reyes-Lin',
    dob: '2025-06-28',
    ageGroup: 'Infant',
    status: 'waitlist',
    plan: 'Full-time (requested)',
    startDate: '2026-01-05',
    teacher: '—',
    allergies: [],
    medications: [],
    notes: 'Requested infant spot for January. Sibling priority.',
    hue: 'from-[#4FB0C6] to-[#8FD7E4]',
  },
]

export const waitlistProspects: WaitlistProspect[] = [
  { id: 'w1', childName: 'Luna Reyes-Lin', ageGroup: 'Infant', requested: 'Jan 2026', family: 'Reyes-Lin Family', note: 'Sibling priority' },
  { id: 'w2', childName: 'Theo Marsh', ageGroup: 'Infant', requested: 'Feb 2026', family: 'Marsh Family', note: 'Toured Oct 12' },
  { id: 'w3', childName: 'Priya Raman', ageGroup: 'Toddler', requested: 'Mar 2026', family: 'Raman Family', note: 'Needs part-time' },
  { id: 'w4', childName: 'Beau Whitfield', ageGroup: 'Preschool', requested: 'Aug 2026', family: 'Whitfield Family', note: 'Referral from Brooks' },
]

/* ---------------- attendance (generated over real business days) --------------- */

function businessDaysBack(count: number): Date[] {
  const out: Date[] = []
  let d = today
  while (out.length < count) {
    const g = getDay(d)
    if (g !== 0 && g !== 6) out.push(new Date(d))
    d = subDays(d, 1)
  }
  return out
}

export const businessDays = businessDaysBack(14)
const activeChildren = children.filter((c) => c.status === 'active')
const inTimes = ['07:45', '08:02', '08:15', '08:30', '08:47']
const outTimes = ['16:05', '16:20', '16:45', '17:05', '17:25']

export const attendance: AttendanceRecord[] = []
let aId = 1
businessDays.forEach((day, di) => {
  activeChildren.forEach((child, ci) => {
    const id = `a${aId++}`
    if (di === 0) {
      const early = ci < 2
      attendance.push({
        id,
        childId: child.id,
        date: iso(day),
        checkIn: early ? inTimes[ci] : null,
        checkOut: null,
        status: early ? 'present' : 'expected',
        note: '',
      })
    } else {
      const absent = (di * 3 + ci) % 11 === 0
      attendance.push({
        id,
        childId: child.id,
        date: iso(day),
        checkIn: absent ? null : inTimes[(ci + di) % inTimes.length],
        checkOut: absent ? null : outTimes[(ci + di * 2) % outTimes.length],
        status: absent ? 'absent' : 'present',
        note: absent ? 'Family called out' : '',
      })
    }
  })
})

/* ---------------- daily logs --------------- */

const moods = ['Cheerful', 'Sleepy but sweet', 'Busy & curious', 'Snuggly', 'Silly', 'Focused']
const mealsPool = [
  'Breakfast: oatmeal with banana (all) · Lunch: chicken, brown rice, green beans (most) · Snack: apple slices + cheese',
  'Breakfast: whole grain waffle + pear (all) · Lunch: turkey pinwheels, cucumber, grapes (all) · Snack: yogurt',
  'Breakfast: scrambled egg + toast (some) · Lunch: black bean quesadilla, corn, mango (all) · Snack: hummus + pita',
  'Breakfast: cereal with milk (all) · Lunch: pasta with veggie sauce, peas (most) · Snack: banana muffin',
]
const activitiesPool = [
  ['Morning circle & weather chart', 'Sensory bin: dried corn scoops', 'Outdoor: bike path laps'],
  ['Story time: "The Snowy Day"', 'Fine motor: pom-pom tongs', 'Outdoor: leaf collecting'],
  ['Music & movement with scarves', 'Painting with sponges', 'Outdoor: water table'],
  ['Letter of the week: M', 'Block tower engineering', 'Outdoor: nature walk to the mailbox'],
]
const notesPool = [
  'Asked to help set the table today — so proud of that job.',
  'Used words to solve a turn-taking moment. Big growth!',
  'Needed extra snuggles after nap, then bounced right back.',
  'Told me a whole story about a dinosaur at the park. Please ask about it.',
  'Ate two helpings of lunch and drank plenty of water.',
]

let photoSlot = 24
let lId = 1
export const dailyLogs: DailyLog[] = []
businessDays.slice(1, 6).forEach((day, di) => {
  activeChildren.forEach((child, ci) => {
    const k = di + ci
    const photos: LogPhoto[] =
      k % 3 === 0
        ? [
            {
              slot: photoSlot++,
              url: `https://placehold.co/640x440/EAF0FC/4F77D9?text=${encodeURIComponent(child.name.split(' ')[0] + ' at play')}`,
              caption: activitiesPool[k % activitiesPool.length][1],
            },
          ]
        : []
    dailyLogs.push({
      id: `dl${lId++}`,
      childId: child.id,
      date: iso(day),
      meals: mealsPool[k % mealsPool.length],
      naps: child.ageGroup === 'Infant' ? '9:20–10:35 AM, 1:05–2:50 PM' : '12:45–2:30 PM',
      potty:
        child.ageGroup === 'Infant'
          ? '5 diaper changes, all typical'
          : child.ageGroup === 'Toddler'
            ? '4 diaper changes · 2 successful potty trips'
            : 'Independent restroom visits ×4',
      mood: moods[k % moods.length],
      activities: activitiesPool[k % activitiesPool.length],
      notes: notesPool[k % notesPool.length],
      photos,
      author: 'Rosalind Hayes',
    })
  })
})

/* ---------------- invoices --------------- */

const rate = settings.rates
export const invoices: Invoice[] = [
  {
    id: 'INV-1041',
    familyId: 'f1',
    period: 'Current month · Brooks',
    issuedAt: iso(subDays(today, 6)),
    dueDate: iso(addDays(today, 4)),
    amount: 2 * rate.fullTime * 4 - 106,
    lineItems: [
      { label: 'Ellie Brooks — Full-time tuition (4 weeks)', qty: 4, unit: rate.fullTime, amount: 4 * rate.fullTime },
      { label: 'Miles Brooks — Full-time tuition (4 weeks)', qty: 4, unit: rate.fullTime, amount: 4 * rate.fullTime },
      { label: 'Sibling discount (10% on second child)', qty: 1, unit: -106, amount: -106 },
    ],
    payments: [],
    memo: 'Autopay is not enabled on this account yet.',
  },
  {
    id: 'INV-1027',
    familyId: 'f1',
    period: 'Previous month · Brooks',
    issuedAt: iso(subDays(today, 36)),
    dueDate: iso(subDays(today, 26)),
    amount: 2014,
    lineItems: [
      { label: 'Ellie Brooks — Full-time tuition (4 weeks)', qty: 4, unit: rate.fullTime, amount: 1060 },
      { label: 'Miles Brooks — Full-time tuition (4 weeks)', qty: 4, unit: rate.fullTime, amount: 1060 },
      { label: 'Sibling discount', qty: 1, unit: -106, amount: -106 },
    ],
    payments: [{ id: 'p1', date: iso(subDays(today, 28)), amount: 2014, method: 'ACH transfer', ref: 'CH-88301' }],
    memo: '',
  },
  {
    id: 'INV-1038',
    familyId: 'f2',
    period: 'Current month · Okafor',
    issuedAt: iso(subDays(today, 22)),
    dueDate: iso(subDays(today, 9)),
    amount: 4 * rate.fullTime + 4 * rate.partTime - 70,
    lineItems: [
      { label: 'Amara Okafor — Full-time tuition (4 weeks)', qty: 4, unit: rate.fullTime, amount: 4 * rate.fullTime },
      { label: 'Zion Okafor — Part-time tuition (4 weeks)', qty: 4, unit: rate.partTime, amount: 4 * rate.partTime },
      { label: 'Sibling discount', qty: 1, unit: -70, amount: -70 },
    ],
    payments: [{ id: 'p2', date: iso(subDays(today, 12)), amount: 800, method: 'Card •••• 4242', ref: 'CH-91120' }],
    memo: 'Partial payment received. Balance carried to next statement if unpaid.',
  },
  {
    id: 'INV-1022',
    familyId: 'f2',
    period: 'Previous month · Okafor',
    issuedAt: iso(subDays(today, 52)),
    dueDate: iso(subDays(today, 41)),
    amount: 1690,
    lineItems: [
      { label: 'Amara Okafor — Full-time tuition (4 weeks)', qty: 4, unit: rate.fullTime, amount: 1060 },
      { label: 'Zion Okafor — Part-time tuition (4 weeks)', qty: 4, unit: rate.partTime, amount: 700 },
      { label: 'Sibling discount', qty: 1, unit: -70, amount: -70 },
    ],
    payments: [{ id: 'p3', date: iso(subDays(today, 44)), amount: 1690, method: 'ACH transfer', ref: 'CH-87004' }],
    memo: '',
  },
  {
    id: 'INV-1044',
    familyId: 'f3',
    period: 'Current month · Reyes-Lin',
    issuedAt: iso(subDays(today, 3)),
    dueDate: iso(addDays(today, 11)),
    amount: 4 * rate.fullTime + 24,
    lineItems: [
      { label: 'Nico Reyes-Lin — Full-time tuition (4 weeks)', qty: 4, unit: rate.fullTime, amount: 4 * rate.fullTime },
      { label: 'Late pickup fee (12 min · Oct 24)', qty: 12, unit: 2, amount: 24 },
    ],
    payments: [],
    memo: '',
  },
  {
    id: 'INV-1030',
    familyId: 'f3',
    period: 'Previous month · Reyes-Lin',
    issuedAt: iso(subDays(today, 33)),
    dueDate: iso(subDays(today, 22)),
    amount: 1060,
    lineItems: [{ label: 'Nico Reyes-Lin — Full-time tuition (4 weeks)', qty: 4, unit: rate.fullTime, amount: 1060 }],
    payments: [{ id: 'p4', date: iso(subDays(today, 24)), amount: 1060, method: 'Card •••• 1881', ref: 'CH-89551' }],
    memo: '',
  },
]

/* ---------------- documents --------------- */

export const documents: DocumentRecord[] = [
  { id: 'd1', title: 'Parent Handbook 2026', category: 'Handbooks', size: 862_000, visibleToParents: true, uploadedBy: 'Rosalind Hayes', uploadedAt: iso(subDays(today, 41)), url: '#', requiresAck: true },
  { id: 'd2', title: 'Enrollment Packet (fillable)', category: 'Forms', size: 410_000, visibleToParents: true, uploadedBy: 'Rosalind Hayes', uploadedAt: iso(subDays(today, 41)), url: '#', requiresAck: false },
  { id: 'd3', title: 'Sick & Medication Policy', category: 'Policies', size: 188_000, visibleToParents: true, uploadedBy: 'Rosalind Hayes', uploadedAt: iso(subDays(today, 27)), url: '#', requiresAck: true },
  { id: 'd4', title: 'November Lunch & Snack Menu', category: 'Menus', size: 96_000, visibleToParents: true, uploadedBy: 'Rosalind Hayes', uploadedAt: iso(subDays(today, 9)), url: '#', requiresAck: false },
  { id: 'd5', title: '2026 Holiday Closure Calendar', category: 'Calendars', size: 74_000, visibleToParents: true, uploadedBy: 'Rosalind Hayes', uploadedAt: iso(subDays(today, 15)), url: '#', requiresAck: false },
  { id: 'd6', title: 'Immunization Record — Ellie Brooks', category: 'Forms', size: 240_000, visibleToParents: false, uploadedBy: 'Maya Brooks', uploadedAt: iso(subDays(today, 30)), url: '#', requiresAck: false },
  { id: 'd7', title: 'Emergency Evacuation Plan', category: 'Policies', size: 152_000, visibleToParents: false, uploadedBy: 'Rosalind Hayes', uploadedAt: iso(subDays(today, 60)), url: '#', requiresAck: false },
  { id: 'd8', title: 'Field Trip Permission — Museum of Life', category: 'Forms', size: 120_000, visibleToParents: true, uploadedBy: 'Rosalind Hayes', uploadedAt: iso(subDays(today, 4)), url: '#', requiresAck: false },
]

export const documentCategories: DocumentCategory[] = ['Handbooks', 'Policies', 'Forms', 'Menus', 'Calendars']

/* ---------------- announcements & threads --------------- */

export const announcements: Announcement[] = [
  {
    id: 'an1',
    title: 'Picture day is next Thursday 📸',
    audience: 'all',
    date: iso(subDays(today, 1)),
    body: `Our photographer arrives at **9:30 AM** next Thursday.

- Please send your little one in clothes without logos if you can
- Order forms will go home in cubbies Tuesday
- No need to send anything extra — we handle hair bows and lint rollers!`,
  },
  {
    id: 'an2',
    title: 'Cold weather gear check',
    audience: 'all',
    date: iso(subDays(today, 5)),
    body: `We go outside every day we can, even in the chill. Please make sure your child's cubby has:

1. A labeled coat
2. Mittens (the clip-on kind survive best)
3. One extra pair of warm socks`,
  },
  {
    id: 'an3',
    title: 'Reminder: invoices post on the 1st',
    audience: 'all',
    date: iso(subDays(today, 12)),
    body: `Monthly statements now post to your **parent portal** on the 1st and are due by the 10th. You can view line items and payment history any time under *Billing*.`,
  },
  {
    id: 'an4',
    title: 'Amara moved to the big-kid highchair',
    audience: 'f2',
    date: iso(subDays(today, 3)),
    body: `Just a happy note — Amara sat with the toddlers at lunch today in the taller chair and did beautifully. She watched Zion the whole time. 💛`,
  },
]

export const threads: Thread[] = [
  {
    id: 't1',
    familyId: 'f1',
    subject: 'Ellie’s nap blanket',
    updatedAt: iso(subDays(today, 2)),
    messages: [
      { id: 'm1', from: 'parent', authorName: 'Maya Brooks', at: iso(subDays(today, 3)), body: 'Hi Auntie Roz — did the yellow blanket make it home Friday? We searched the car twice!' },
      { id: 'm2', from: 'admin', authorName: 'Rosalind Hayes', at: iso(subDays(today, 2)), body: 'It was tucked in the reading loft. It is washed and back in her cubby — no worries at all.' },
    ],
  },
  {
    id: 't2',
    familyId: 'f2',
    subject: 'Bottle schedule change',
    updatedAt: iso(subDays(today, 4)),
    messages: [
      { id: 'm3', from: 'parent', authorName: 'Daniel Okafor', at: iso(subDays(today, 5)), body: 'We are stretching Amara to 4oz every 3.5 hours starting this week.' },
      { id: 'm4', from: 'admin', authorName: 'Rosalind Hayes', at: iso(subDays(today, 4)), body: 'Noted and posted on the fridge chart. I will log every bottle in her daily report.' },
    ],
  },
  {
    id: 't3',
    familyId: 'f3',
    subject: 'January infant spot for Luna',
    updatedAt: iso(subDays(today, 8)),
    messages: [
      { id: 'm5', from: 'parent', authorName: 'Sofia Reyes-Lin', at: iso(subDays(today, 9)), body: 'Wanted to confirm Luna is still first in line for the January infant opening.' },
      { id: 'm6', from: 'admin', authorName: 'Rosalind Hayes', at: iso(subDays(today, 8)), body: 'Yes — sibling priority holds her spot. I will send the enrollment packet December 1st.' },
    ],
  },
]

/* ---------------- marketing content --------------- */

export const programs: Program[] = [
  {
    id: 'infants',
    name: 'Infants',
    ages: '6 weeks – 17 months',
    hours: '7:00 AM – 5:45 PM',
    ratio: '1 caregiver : 3 infants',
    spots: 'Waitlist · next opening January',
    slot: 11,
    image: 'https://placehold.co/720x520/FDF1DC/C98A18?text=Infant+Room',
    summary: 'Slow mornings, held bottles, and a rhythm that follows your baby — not a clock on the wall.',
    routine: [
      'Arrival snuggles and a hand-off chat with you',
      'Tummy time, mirrors, and floor exploration',
      'Bottle & nap on your baby’s own schedule',
      'Stroller walk to the mailbox (weather permitting)',
      'Sensory basket play and lullaby wind-down',
    ],
    highlights: ['Written log for every bottle, nap, and diaper', 'Safe-sleep certified cribs', 'Baby sign language introduced'],
  },
  {
    id: 'toddlers',
    name: 'Toddlers',
    ages: '18 months – 2 years',
    hours: '7:00 AM – 5:45 PM',
    ratio: '1 caregiver : 4 toddlers',
    spots: '1 part-time spot open',
    slot: 12,
    image: 'https://placehold.co/720x520/E6F6F0/2E8C72?text=Toddler+Room',
    summary: 'Big feelings, small bodies. We teach words for emotions and let them climb, pour, and dump.',
    routine: [
      'Open play and breakfast together',
      'Morning circle: songs, weather, names',
      'Sensory table and messy art',
      'Outdoor gross-motor time',
      'Family-style lunch, then a real 90-minute nap',
      'Afternoon snack, books, and free choice',
    ],
    highlights: ['Gentle potty learning on your timeline', 'Emotion-coaching language', 'Two outdoor blocks daily'],
  },
  {
    id: 'preschool',
    name: 'Preschool',
    ages: '3 – 5 years',
    hours: '7:00 AM – 5:45 PM',
    ratio: '1 caregiver : 6 children',
    spots: '2 full-time spots open',
    slot: 13,
    image: 'https://placehold.co/720x520/EAF0FC/3960BE?text=Preschool+Nook',
    summary: 'Kindergarten readiness that still looks like childhood: projects, questions, and a lot of dirt.',
    routine: [
      'Journal drawing and morning jobs',
      'Letter, number, and story workshop',
      'Project time (building, planting, cooking)',
      'Outdoor exploration and bike path',
      'Lunch, rest, then STEM or art choice',
      'Closing circle: what we learned today',
    ],
    highlights: ['Name writing & letter sounds', 'Weekly cooking project', 'Show-and-tell Fridays'],
  },
]

export const team: TeamMember[] = [
  {
    id: 'tm1',
    name: 'Rosalind “Auntie Roz” Hayes',
    role: 'Owner & Lead Teacher',
    slot: 8,
    image: 'https://placehold.co/560x560/EAF0FC/3960BE?text=Auntie+Roz',
    bio: '19 years in early childhood education, B.A. in Child Development from NC Central. Opened Aunties Tykes in her own home in 2016 so that families could have a place that felt like family.',
    creds: ['NC Level III Credential', 'Infant/Child CPR + First Aid', 'Safe Sleep Certified'],
  },
  {
    id: 'tm2',
    name: 'Deborah “Ms. Deb” Winn',
    role: 'Toddler Teacher',
    slot: 9,
    image: 'https://placehold.co/560x560/E6F6F0/2E8C72?text=Ms.+Deb',
    bio: 'Ten years with toddlers and the calmest voice in the house. Ms. Deb runs our sensory program and can turn a meltdown into a giggle in under a minute.',
    creds: ['NC Early Childhood Credential', 'CPR + First Aid', 'ITS-SIDS Trained'],
  },
  {
    id: 'tm3',
    name: 'Priya Raghavan',
    role: 'Preschool Teacher & Curriculum',
    slot: 10,
    image: 'https://placehold.co/560x560/F6EEFD/6F4CB8?text=Ms.+Priya',
    bio: 'Former public kindergarten teacher who builds our project-based units. She keeps a running list of every child’s current obsession and plans around it.',
    creds: ['B.S. Elementary Education', 'CPR + First Aid', 'Creative Curriculum Trained'],
  },
]

export const galleryItems: GalleryItem[] = [
  { id: 'g1', slot: 14, category: 'Classroom', title: 'The reading loft', src: 'https://placehold.co/800x600/EAF0FC/3960BE?text=Reading+Loft' },
  { id: 'g2', slot: 15, category: 'Classroom', title: 'Morning circle rug', src: 'https://placehold.co/800x600/FDF1DC/C98A18?text=Circle+Time' },
  { id: 'g3', slot: 16, category: 'Outdoor', title: 'Bike path & garden beds', src: 'https://placehold.co/800x600/E6F6F0/2E8C72?text=Garden+Beds' },
  { id: 'g4', slot: 17, category: 'Activities', title: 'Sensory corn bin', src: 'https://placehold.co/800x600/F6EEFD/6F4CB8?text=Sensory+Bin' },
  { id: 'g5', slot: 18, category: 'Outdoor', title: 'Mud kitchen', src: 'https://placehold.co/800x600/EFEAE1/8A7A63?text=Mud+Kitchen' },
  { id: 'g6', slot: 19, category: 'Activities', title: 'Friday cooking project', src: 'https://placehold.co/800x600/FDECEC/C25252?text=Cooking+Day' },
  { id: 'g7', slot: 20, category: 'Classroom', title: 'Nap nook', src: 'https://placehold.co/800x600/E9F3FA/2F6E92?text=Nap+Nook' },
  { id: 'g8', slot: 21, category: 'Activities', title: 'Easel painting', src: 'https://placehold.co/800x600/FCF4E3/B58A2B?text=Easel+Art' },
  { id: 'g9', slot: 22, category: 'Outdoor', title: 'Fall leaf hunt', src: 'https://placehold.co/800x600/EDF6E9/558B3A?text=Leaf+Hunt' },
]

export const testimonials: Testimonial[] = [
  {
    id: 'q1',
    quote:
      'We toured six centers. Aunties Tykes was the only place where the toddlers ran to the door to greet us. Roz sends a photo every single day, and I never wonder how my son is doing.',
    name: 'Maya',
    detail: 'mom to Ellie (2) and Miles (5)',
  },
  {
    id: 'q2',
    quote:
      'Our daughter has a peanut allergy and I was terrified. Their protocol is tighter than my own kitchen. The peace of mind alone is worth it.',
    name: 'Daniel',
    detail: 'dad to Zion (3) and Amara (1)',
  },
  {
    id: 'q3',
    quote:
      'Nico came home saying his letter sounds and singing in two languages. It feels like a tiny school run by someone who genuinely loves him.',
    name: 'Sofia',
    detail: 'mom to Nico (4)',
  },
]

export const faqs: Faq[] = [
  { q: 'What are your hours?', a: 'We are open Monday through Friday, 7:00 AM to 5:45 PM. Drop-off closes at 9:30 AM so we can start our morning rhythm without interruptions.' },
  { q: 'What should we pack each day?', a: 'A labeled water bottle, two full changes of clothes (three during potty learning), diapers/wipes if needed, a crib sheet and small blanket for nap, and weather-appropriate outerwear. We provide all meals and snacks.' },
  { q: 'Do you provide meals?', a: 'Yes. Breakfast, a hot lunch, and an afternoon snack are all included and posted on a monthly menu. We are a peanut-free house and can accommodate most dietary needs with a note from you.' },
  { q: 'How does nap time work?', a: 'Infants sleep on their own schedule in safe-sleep certified cribs. Toddlers and preschoolers rest from about 12:45 to 2:30. Non-sleepers get quiet books and puzzles on their mat after 45 minutes.' },
  { q: 'How do you handle potty training?', a: 'We follow your lead and start when your child shows readiness. Bathroom visits happen after meals and before nap, and accidents are treated as a normal part of learning.' },
  { q: 'What is your sick policy?', a: 'Children need to stay home with a fever of 100.4°F or higher, vomiting or diarrhea, an undiagnosed rash, or draining eyes. They may return 24 hours after symptoms resolve without medication.' },
  { q: 'Are you licensed and insured?', a: 'Yes — we hold NC Family Child Care Home license NC-FCCH-118427, carry liability insurance, and every adult in the home has a cleared background check plus current CPR and First Aid.' },
  { q: 'How do we get updates during the day?', a: 'Every family gets a parent portal login. Daily reports with meals, naps, diapers, mood, activities, and photos are posted before pickup. Announcements and invoices live there too.' },
  { q: 'Is there a waitlist?', a: 'Usually, yes. We keep 12 spots total. Join the waitlist through the contact form and we will tell you honestly where you stand and when we expect an opening.' },
  { q: 'Do you offer part-time care?', a: 'We offer part-time (three fixed days) and occasional drop-in care when a spot is available. Full-time families always get first choice of schedule.' },
]

export const revenueTrend: RevenuePoint[] = [
  { month: 'Jun', collected: 8320, billed: 8800 },
  { month: 'Jul', collected: 8940, billed: 8940 },
  { month: 'Aug', collected: 7610, billed: 8100 },
  { month: 'Sep', collected: 9180, billed: 9400 },
  { month: 'Oct', collected: 9640, billed: 9880 },
  { month: 'Nov', collected: 6120, billed: 9760 },
]

export const leads: Lead[] = [
  { id: 'ld1', parentName: 'Alicia Marsh', email: 'alicia.marsh@example.com', phone: '(919) 555-0611', childAges: '4 months', message: 'Looking for infant care starting February. Heard about you from the Brooks family.', createdAt: iso(subDays(today, 2)), tourDate: iso(addDays(today, 5)), status: 'Tour scheduled' },
  { id: 'ld2', parentName: 'Kenji Watanabe', email: 'kenji.w@example.com', phone: '(984) 555-0722', childAges: '2 yrs', message: 'Need part-time Tuesday/Thursday care. Is that possible?', createdAt: iso(subDays(today, 6)), tourDate: '', status: 'New inquiry' },
]