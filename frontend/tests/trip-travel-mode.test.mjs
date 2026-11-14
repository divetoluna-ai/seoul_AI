import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TripTravelMode from '../src/TripTravelMode.ts';

test('travel mode explains the routing basis without presenting an interactive control', () => {
  const html = renderToStaticMarkup(createElement(TripTravelMode));
  assert.match(html, /경로 기준: 자동차/);
  assert.doesNotMatch(html, /<(?:button|a|input|select)\b|role="(?:button|tab|switch)"|tabindex=/i);
  assert.match(html, /<svg[^>]+aria-hidden="true"/);
});
