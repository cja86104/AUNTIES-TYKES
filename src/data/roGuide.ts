/**
 * The owner's guide to Ro — the words on /admin/ro-guide.
 *
 * Written for the owner, not for developers: what Ro can do, what to say to get
 * it done, and what to expect on the card. Every line here was checked against
 * Ro's actual tools in api/_lib/ai/tools/ — nothing is described that she cannot
 * do, and every limit she has is stated.
 *
 * KEEP IN STEP WITH RO. When a tool is added, changed or removed, update the
 * matching topic here and move RO_GUIDE_UPDATED_AT forward. That timestamp is
 * what puts the "New" pill on the guide's sidebar link (src/lib/unread.ts), so
 * the owner notices the guide changed — the same rule as every other new thing
 * in the app. Set it to the moment of the change, never a future time: a future
 * stamp keeps the pill lit even after she has read it.
 */

/** When the guide last changed. ISO timestamp, in the past. */
export const RO_GUIDE_UPDATED_AT = '2026-10-09T00:00:00.000Z'

export interface GuideTopic {
  /** Anchor id, and the key the page uses to pick an icon. */
  id: string
  title: string
  /** One or two sentences: what this is. */
  intro: string
  /** Things she can say, word for word. */
  examples: string[]
  /** What to expect, and the limits. */
  notes: string[]
}

export interface GuideStep {
  title: string
  body: string
}

/* ------------------------------- getting started ---------------------------- */

export const GETTING_STARTED: GuideStep[] = [
  {
    title: 'Open Ro',
    body:
      'Tap the Ro button with the sparkle at the top right of any admin page. On a computer she ' +
      'slides in on the right and stays open while you move around the console. On a phone she ' +
      'fills the screen — tap the X to close her.',
  },
  {
    title: 'Type or talk',
    body:
      'Type in the "Ask Ro…" box and tap the arrow (or press Enter). To talk instead, tap the ' +
      'microphone, say what you need, and tap ■ when you are done. The bars move while she is ' +
      'listening, and your words appear once you stop.',
  },
  {
    title: 'Listen to her answer',
    body:
      'Tap Listen under any reply and Ro reads it out loud. Tap Stop to end it early.',
  },
  {
    title: 'Start fresh',
    body:
      'Tap New at the top of the panel to clear the conversation and start over. It is a good ' +
      'habit when you switch to a different topic.',
  },
]

/* ------------------------------ how cards work ------------------------------ */

export const CARD_STEPS: GuideStep[] = [
  {
    title: 'Ro never changes anything on her own',
    body:
      'When you ask for something that saves, sends or changes a record, Ro puts a card under ' +
      'her reply showing exactly what will happen. Nothing is saved or sent until you tap the ' +
      'blue button on the card.',
  },
  {
    title: 'Read the card, then decide',
    body:
      'The card lists every detail — the family, the wording, the amounts, the dates. Tap the ' +
      'blue button to do it, or "No thanks" to drop it. If something is wrong, tap "No thanks" ' +
      'and tell Ro what to change.',
  },
  {
    title: 'Watch for "Careful" lines',
    body:
      'When something deserves a second look — a second invoice for the same month, an allergy ' +
      'being taken off, a child moving to the waitlist — the card says so in a "Careful" line.',
  },
  {
    title: 'What the labels mean',
    body:
      '"Waiting on you" — it is ready for your tap. "Done" — it went through. "Dismissed" — you ' +
      'said no, and nothing changed. "Didn\'t go through" — it could not be done; the card says ' +
      'why, and "Try again" is there when it makes sense. "Pulled back" — you undid it.',
  },
  {
    title: 'Undo, for messages and announcements',
    body:
      'After a message or announcement goes out, an Undo button counts down for 5 minutes. ' +
      'Tapping it takes it back out of the family\'s portal completely. Other actions have no ' +
      'undo — that is why the card comes first.',
  },
]

/* ------------------------------ what she can do ----------------------------- */

export const TOPICS: GuideTopic[] = [
  {
    id: 'today',
    title: 'Ask about your day',
    intro:
      'Ro can look up anything in the console — attendance, schedules, families, invoices, ' +
      'messages, enrollment forms, the calendar and your policies — and answer in plain words.',
    examples: [
      'Who is here right now?',
      'Who is coming on Thursday?',
      'Who still owes money?',
      'Which parents are waiting on a reply from me?',
      'Any birthdays this month?',
      'What does our sick policy say?',
    ],
    notes: [
      'Ro only answers from your real records. If something is not in the app, she says she does not have it rather than guessing.',
      'If a child\'s schedule was never entered, Ro says she does not know whether they are coming — she never assumes they are off.',
      'Tap the small line under a reply to see what Ro looked up to answer you.',
    ],
  },
  {
    id: 'notices',
    title: 'What Ro keeps an eye on',
    intro:
      'Every time you talk to her, Ro checks for things that need your attention. Ask her ' +
      'what is going on and she will lead with the most urgent.',
    examples: ['What is going on today?', 'Anything I should know about?', 'What needs my attention?'],
    notes: [
      'New enrollment forms, and forms that have waited more than 3 days.',
      'Overdue invoices — flagged as urgent once they are a week late.',
      'Parent messages waiting on a reply for more than 3 hours — urgent after a day.',
      'Incident reports a family has not confirmed reading, and documents families still need to acknowledge.',
      'Children checked out today with no daily log written.',
      'Inquiries with no follow-up after a week.',
      'New weekly schedules starting in the next 7 days.',
      'Ro only checks when you open her. She does not run in the background or message you on her own.',
    ],
  },
  {
    id: 'attendance',
    title: 'Attendance',
    intro: 'Check children in and out, or mark them absent.',
    examples: ['Check in Ellie.', 'Sam is going home.', 'Mark Ava absent today, she has a cold.'],
    notes: [
      'A child can come and go more than once a day. Checking them in again after they left starts a new visit and keeps the first one.',
      'A child cannot be marked absent once they have a check-in time that day — recorded times are never erased.',
      'A child who was never checked in cannot be checked out. Ro will tell you instead of making up an arrival time.',
    ],
  },
  {
    id: 'logs',
    title: 'Daily logs & incident reports',
    intro:
      'Tell Ro how a child\'s day went and she writes it into their daily log. She can also ' +
      'add an incident or injury report.',
    examples: [
      'Write Ellie\'s log: ate all her lunch, napped 1 to 2:30, a happy day, painted with the big kids.',
      'Add to Sam\'s log that he went down for his nap easily.',
      'Write an incident report for Ava: bumped her knee on the slide at 10:15, ice applied, she was fine after.',
    ],
    notes: [
      'Ro writes only what you tell her. She never fills in a meal, nap or mood on her own.',
      'If a log already exists for that day, Ro adds to it — anything you do not mention stays as it was.',
      'Families only see the parts that were filled in.',
      'Photos and PDFs are added from the Daily Logs page. Ro cannot delete a log.',
    ],
  },
  {
    id: 'messages',
    title: 'Messages & announcements',
    intro:
      'Ro writes the message for you and shows it on a card. Read it, and tap to send — or ask ' +
      'her to change the wording first.',
    examples: [
      'Message the Brooks family that pickup is at 4 tomorrow.',
      'Reply to the Chens and tell them Friday works.',
      'Send an announcement to everyone: we are closed Monday for the holiday.',
    ],
    notes: [
      'Messages land in the family\'s parent portal. Nothing is emailed or texted — if someone needs to know right away, give them a call.',
      'You have 5 minutes to Undo after sending.',
      'If one of your standing instructions says not to contact a family, Ro will not send it and will tell you which instruction stopped it.',
      'For safety, Ro sends at most 20 times, or to 120 families, in any hour.',
    ],
  },
  {
    id: 'schedules',
    title: 'Schedules',
    intro:
      'Tell Ro when a child\'s day is different, or when their usual week is changing, and she ' +
      'saves it ahead of time so attendance follows it on the day.',
    examples: [
      'Ellie is coming at 10 next Friday.',
      'Sam is off on the 23rd.',
      'From the 20th, Ava comes Monday, Wednesday and Friday, 8 to 3.',
      'Cancel Ava\'s new schedule.',
      'Who is here next Tuesday?',
    ],
    notes: [
      'Families see schedule changes in their portal, marked as new.',
      'A new usual week starts on its own on the date you give. Ro mentions it in the week before.',
      'Give Ro the times. If you leave them out, she will ask rather than guess.',
      'A new usual week has to start on a later date. To change a child\'s usual week starting today, use their page.',
    ],
  },
  {
    id: 'calendar',
    title: 'Family calendar',
    intro: 'Add closures, early closes, activities and reminders, or change ones already there.',
    examples: [
      'We are closed November 26th for Thanksgiving.',
      'We are closing early at 3 this Friday.',
      'Add pajama day on the 31st.',
      'Move the field trip to the 14th.',
    ],
    notes: [
      'Closures and early closes are taken into account for who is expected that day.',
      'Ro cannot remove an event. Do that from the Family Calendar page.',
    ],
  },
  {
    id: 'families',
    title: 'Families & children',
    intro: 'Add a new family with their children, or change details for a family or child already on file.',
    examples: [
      'Add a new family: the Garcias, Maria Garcia, maria@example.com, 717-555-0142, 12 Oak St, Camp Hill. Their son Leo was born March 3rd 2024, toddler, starts November 1st.',
      'Change the Brooks family\'s phone number to 717-555-0199.',
      'Add eggs to Ellie\'s allergies.',
      'Take peanuts off Sam\'s allergies.',
      'Move Sam to the waitlist.',
      'Set the Chens\' weekly rate to $250.',
    ],
    notes: [
      'Only what you name changes. The card shows each change as before → after.',
      'Allergies, medications and emergency contacts are added or taken off one at a time, so nothing gets dropped by accident.',
      'Changing a family\'s email does not change the email they use to sign in to the portal.',
      'A child\'s days and times are changed under Schedules, not here. Ro cannot move a child to a different family.',
      'If anything required is missing, like a date of birth for a new child, Ro will ask you for it.',
    ],
  },
  {
    id: 'enrollments',
    title: 'Future Arrivals (enrollment forms)',
    intro: 'Ro can tell you what came in on the enrollment form, and approve or decline a form once you decide.',
    examples: ['Any new enrollment forms?', 'What did the Nguyen form say?', 'Approve the Nguyen form.', 'Decline the Smith form.'],
    notes: [
      'Ro never decides for you. She only approves or declines when you tell her which.',
      'Approving adds the family and children to your roster exactly as the form was filled in.',
      'Neither choice tells the family anything — let them know yourself. Approving does not create their portal login.',
    ],
  },
  {
    id: 'logins',
    title: 'Parent portal logins',
    intro: 'Ro can set up a parent\'s login to the family portal for a family already on file.',
    examples: ['Set up a portal login for the Garcias.'],
    notes: [
      'You type the password yourself, right on the card. Never say a password to Ro — she will ask you to type it on the card instead.',
      'After it is done, tap "Copy login details" to copy the email and password to give to the parent.',
      'No email is sent to the parent. You give them the login yourself.',
    ],
  },
  {
    id: 'billing',
    title: 'Invoices & payments',
    intro: 'Create invoices, and write down payments you have received.',
    examples: [
      'Bill the Brooks family for tuition, due the 15th.',
      'Invoice the Chens for the $50 registration fee, due Friday.',
      'The Garcias paid $400 by check, number 1042.',
      'Who is overdue?',
    ],
    notes: [
      'Tuition uses the family\'s own weekly rate for 4 weeks per child, with the sibling discount from your rate card. If a family has no weekly rate, Ro will tell you instead of guessing.',
      'Every price comes from you or your rate card — Ro never makes one up. She asks for the due date if you do not give one.',
      'The card warns you if that family already has an invoice for the same month, or if the due date has passed.',
      'For a payment, say how it was paid. If it is more than what is owed, only the balance is recorded, and the card says so.',
      'No money moves through the app. An invoice is a statement in the family\'s portal; a payment is your record of money you already have.',
    ],
  },
  {
    id: 'documents',
    title: 'Documents',
    intro: 'Show a document to parents, or hide it from them.',
    examples: ['Show the handbook to parents.', 'Hide the old lunch menu.'],
    notes: ['Uploading and deleting documents is done on the Documents page.'],
  },
  {
    id: 'inquiries',
    title: 'Inquiries',
    intro: 'Keep track of families who reach out about a spot.',
    examples: [
      'Log a new inquiry: Jamie Lee called about a toddler spot, 717-555-0188.',
      'Book a tour with Jamie Lee for Tuesday.',
      'Mark the Lee inquiry as enrolled.',
    ],
    notes: ['Ro cannot delete an inquiry.'],
  },
  {
    id: 'rules',
    title: 'Standing instructions',
    intro:
      'Tell Ro how to handle something from now on, and she remembers it in every future ' +
      'conversation. She also remembers when she has promised to check back on something.',
    examples: [
      'Don\'t message the Brooks family until Friday.',
      'The Chens always pay on the 5th.',
      'Remind me about the fire drill.',
      'You can message the Brooks family again.',
      'What instructions have I given you?',
    ],
    notes: [
      'Each instruction is shown on a card before it is saved, so you can check Ro understood it.',
      'A "don\'t contact" instruction stops Ro from sending to that family until it ends or you turn it off.',
      'When Ro tells you she will check on something, she writes it down and brings it up the next time it matters.',
    ],
  },
]

/* --------------------------------- limits ----------------------------------- */

export const CANNOT_DO: string[] = [
  'Delete anything — daily logs, calendar events, invoices, documents, families or inquiries. Use the console pages for that.',
  'Change or delete an invoice once it is created.',
  'Change your business settings, hours, rates or policies.',
  'Upload files or photos.',
  'Send an email or a text. Everything she sends goes to the parent portal.',
  'Do things on her own. Ro only works while you are talking to her.',
]

/* ---------------------------------- tips ------------------------------------ */

export const TIPS: string[] = [
  'Use names and dates the way you would say them — "next Friday", "the 23rd", "the Brooks family". Ro works in Eastern time.',
  'Be specific with times and amounts. If something is missing, Ro will ask one question rather than guess.',
  'One request at a time works best. You can ask the next thing as soon as the card is up.',
  'Always read the card before you tap. The card is exactly what will happen.',
  'If an answer looks off, ask "How do you know that?" or tap the line under her reply to see what she looked up.',
  'Using your voice on an iPhone: when Safari asks to use the microphone, tap Allow. If you see "Microphone blocked", allow the microphone for this site in Safari\'s settings, then try again.',
]
