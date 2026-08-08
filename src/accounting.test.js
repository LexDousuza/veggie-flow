import { customerBalance, totalReceivable, receivablesAging } from './App';

test('customerBalance is gave minus got for that party only', () => {
  const entries = [
    { party_name: 'A', entry_type: 'gave', amount: 500 },
    { party_name: 'A', entry_type: 'got', amount: 200 },
    { party_name: 'B', entry_type: 'gave', amount: 1000 },
  ];
  expect(customerBalance(entries, 'A')).toBe(300);
  expect(customerBalance(entries, 'B')).toBe(1000);
  expect(customerBalance(entries, 'Nobody')).toBe(0);
});

test('totalReceivable ignores parties who are in credit (negative balance)', () => {
  const entries = [
    { party_name: 'A', entry_type: 'gave', amount: 300 },
    { party_name: 'B', entry_type: 'got', amount: 100 }, // B is in credit, shouldn't subtract
  ];
  expect(totalReceivable(entries)).toBe(300);
});

test('receivablesAging buckets unpaid debits by age, oldest-first against payments', () => {
  const today = '2026-08-08';
  const entries = [
    { party_type: 'customer', party_name: 'A', entry_type: 'gave', amount: 100, date: '2026-08-01' }, // 7 days old, fully unpaid
    { party_type: 'customer', party_name: 'A', entry_type: 'gave', amount: 200, date: '2026-06-01' }, // 68 days old
    { party_type: 'customer', party_name: 'A', entry_type: 'got', amount: 200 }, // pays off the OLDEST debit first
  ];
  const aging = receivablesAging(entries, today);
  // The 68-day-old ₹200 debit gets paid off by the ₹200 payment (oldest-first),
  // leaving only the 7-day-old ₹100 debit outstanding.
  expect(aging['0-15']).toBe(100);
  expect(aging['60+']).toBe(0);
});
