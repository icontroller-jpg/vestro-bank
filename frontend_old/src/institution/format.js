export const F0 = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
})

export const N = new Intl.NumberFormat('en-IN')

export const cr = (v) => (
  v >= 1e7
    ? '₹' + (v / 1e7).toFixed(2) + ' Cr'
    : v >= 1e5
      ? '₹' + (v / 1e5).toFixed(2) + ' L'
      : F0.format(v)
)