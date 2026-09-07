import { Link, useParams } from 'react-router-dom'
import { ReceiptText } from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import InvoiceView from '../../components/InvoiceView'
import { Button, EmptyState } from '../../components/ui'
import { useFamilyScope } from '../../lib/useFamilyScope'

export default function ParentInvoiceDetail() {
  const { id } = useParams<{ id: string }>()
  const { invoices, family } = useFamilyScope()

  // Scoped to this family's invoices, so one family cannot open another's statement.
  const invoice = invoices.find((i) => i.id === id)

  if (!invoice) {
    return (
      <PageTransition>
        <EmptyState
          icon={ReceiptText}
          title="We couldn't find that invoice"
          description="It may have been removed, or the link belongs to a different account."
          action={
            <Button as={Link} to="/parent/billing">
              Back to billing
            </Button>
          }
        />
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <InvoiceView invoice={invoice} family={family} backTo="/parent/billing" mode="parent" />
    </PageTransition>
  )
}
