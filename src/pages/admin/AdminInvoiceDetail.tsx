import { Link, useParams } from 'react-router-dom'
import { ReceiptText } from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import InvoiceView from '../../components/InvoiceView'
import { Button, EmptyState } from '../../components/ui'
import { useStore } from '../../store/useStore'

export default function AdminInvoiceDetail() {
  const { id } = useParams<{ id: string }>()
  const invoices = useStore((s) => s.invoices)
  const families = useStore((s) => s.families)

  const invoice = invoices.find((i) => i.id === id)

  if (!invoice) {
    return (
      <PageTransition>
        <EmptyState
          icon={ReceiptText}
          title="That invoice no longer exists"
          description="It may have been removed, or the link is out of date."
          action={
            <Button as={Link} to="/admin/invoices">
              Back to invoices
            </Button>
          }
        />
      </PageTransition>
    )
  }

  const family = families.find((f) => f.id === invoice.familyId)

  return (
    <PageTransition>
      <InvoiceView invoice={invoice} family={family} backTo="/admin/invoices" mode="admin" />
    </PageTransition>
  )
}
