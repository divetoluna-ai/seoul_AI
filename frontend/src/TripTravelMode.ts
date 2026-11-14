import { createElement } from 'react';
import { Car } from 'lucide-react';

export default function TripTravelMode() {
  return createElement('span', { className: 'trip-mode' },
    createElement(Car, { size: 15, 'aria-hidden': true }),
    createElement('span', null, '경로 기준: 자동차'));
}
