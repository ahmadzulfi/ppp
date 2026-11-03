import { describe, expect, it } from 'vitest'
import { formatPhone, initials } from './format'

describe('formatPhone', () => {
  it('memformat nomor Indonesia', () => {
    expect(formatPhone('6281234567890')).toBe('+62 812-3456-7890')
  })

  it('negara lain hanya diberi tanda plus', () => {
    expect(formatPhone('14155550100')).toBe('+14155550100')
  })
})

describe('initials', () => {
  it('mengambil huruf depan dua kata pertama', () => {
    expect(initials('budi santoso wibowo', 'x')).toBe('BS')
  })

  it('memakai cadangan kalau nama kosong', () => {
    expect(initials('  ', 'admin@contoh.id')).toBe('A')
  })
})
