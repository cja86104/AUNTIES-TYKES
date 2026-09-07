import { Link } from 'react-router-dom'
import { MapPin, Phone, Mail, Clock, ShieldCheck } from 'lucide-react'
import { useStore } from '../store/useStore'

export default function PublicFooter() {
  const settings = useStore((s) => s.settings)

  return (
    <footer className="mt-24 border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-14 lg:grid-cols-4 lg:px-8">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4F77D9] to-[#5DC4A6]">
              <span className="font-display text-lg font-black text-white">AT</span>
            </span>
            <span className="font-display text-xl font-extrabold text-slate-900">Aunties Tykes</span>
          </div>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-slate-600">{settings.tagline}</p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#5DC4A6]/10 px-3 py-2 text-xs font-semibold text-[#25705c]">
            <ShieldCheck size={15} />
            NC Licensed Family Child Care Home · {settings.licenseNumber}
          </div>
        </div>

        <div>
          <h4 className="font-display text-sm font-bold uppercase tracking-wider text-slate-900">Explore</h4>
          <ul className="mt-4 space-y-2.5 text-sm">
            {[
              ['/about', 'About Auntie Roz'],
              ['/programs', 'Programs & ages'],
              ['/tuition-policies', 'Tuition & policies'],
              ['/gallery', 'Photo gallery'],
              ['/faq', 'Parent FAQ'],
              ['/contact', 'Schedule a tour'],
              ['/login', 'Parent portal login'],
            ].map(([to, label]) => (
              <li key={to}>
                <Link to={to} className="text-slate-600 transition hover:text-[#4F77D9]">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="font-display text-sm font-bold uppercase tracking-wider text-slate-900">Visit & contact</h4>
          <ul className="mt-4 space-y-3.5 text-sm text-slate-600">
            <li className="flex gap-2.5">
              <MapPin size={16} className="mt-0.5 shrink-0 text-[#4F77D9]" />
              {settings.address}
            </li>
            <li className="flex gap-2.5">
              <Phone size={16} className="mt-0.5 shrink-0 text-[#4F77D9]" />
              <a className="transition hover:text-[#4F77D9]" href={`tel:${settings.phone.replace(/[^0-9]/g, '')}`}>
                {settings.phone}
              </a>
            </li>
            <li className="flex gap-2.5">
              <Mail size={16} className="mt-0.5 shrink-0 text-[#4F77D9]" />
              <a className="transition hover:text-[#4F77D9]" href={`mailto:${settings.email}`}>
                {settings.email}
              </a>
            </li>
            <li className="flex gap-2.5">
              <Clock size={16} className="mt-0.5 shrink-0 text-[#4F77D9]" />
              {settings.hours}
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-200">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p>© {new Date().getFullYear()} Aunties Tykes Family Child Care. All rights reserved.</p>
          <p>Made with care in Durham, North Carolina.</p>
        </div>
      </div>
    </footer>
  )
}