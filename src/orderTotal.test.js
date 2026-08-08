import { orderTotal } from './App';

test('orderTotal rounds off to nearest rupee', () => {
  const inventory = { Tomato: { unit: 'kg', rate: 33.33 } };
  const order = { customer: 'Test', items: [{ name: 'Tomato', qty: 1.5, unit: 'kg' }] };
  // 1.5 * 33.33 = 49.995 → rounds to 50
  expect(orderTotal(order, inventory)).toBe(50);
});
