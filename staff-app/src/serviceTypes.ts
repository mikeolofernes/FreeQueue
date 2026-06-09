export const BRANCH_CATEGORIES = [
  { value: 'clinic',      label: 'Clinic / Hospital' },
  { value: 'bank',        label: 'Bank / Financial' },
  { value: 'government',  label: 'Government Office' },
  { value: 'pharmacy',    label: 'Pharmacy / Drugstore' },
  { value: 'retail',      label: 'Retail Store' },
  { value: 'general',     label: 'General / Other' },
] as const

export const CATEGORY_SERVICES: Record<string, string[]> = {
  clinic:     ['Consultation', 'Lab Test', 'Vaccination', 'Pharmacy', 'Medical Certificate'],
  bank:       ['New Account', 'Deposit', 'Withdrawal', 'Loan Inquiry', 'Card Services'],
  government: ['Document Request', 'ID Renewal', 'Permit Application', 'Payment', 'Inquiry'],
  pharmacy:   ['Prescription', 'Over-the-Counter', 'Medicine Inquiry', 'Consultation'],
  retail:     ['Customer Service', 'Returns & Exchange', 'Layaway', 'Payment', 'Inquiry'],
  general:    ['Service', 'Inquiry', 'Payment', 'Appointment', 'Other'],
}

export function getServiceTypes(category?: string | null): string[] {
  return CATEGORY_SERVICES[category ?? 'general'] ?? CATEGORY_SERVICES.general
}
