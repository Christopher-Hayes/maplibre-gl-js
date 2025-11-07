import {describe, test, expect} from 'vitest';
import {calculateInterpolationFactor, interpolateValue} from './transition_helper';
import {Color} from '@maplibre/maplibre-gl-style-spec';

describe('transition_helper', () => {
    describe('calculateInterpolationFactor', () => {
        test('returns 0 before transition begins', () => {
            const result = calculateInterpolationFactor(100, 200, 300);
            expect(result).toBe(0);
        });

        test('returns 1 after transition ends', () => {
            const result = calculateInterpolationFactor(400, 200, 300);
            expect(result).toBe(1);
        });

        test('returns eased value during transition', () => {
            // At 50% through transition
            const result = calculateInterpolationFactor(250, 200, 300);
            // With cubic-in-out easing, 0.5 should stay close to 0.5
            expect(result).toBeGreaterThan(0);
            expect(result).toBeLessThan(1);
            expect(result).toBeCloseTo(0.5, 1);
        });

        test('handles zero-duration transition', () => {
            const result = calculateInterpolationFactor(200, 200, 200);
            // When begin === end, should return 1 (completed)
            expect(result).toBe(1);
        });
    });

    describe('interpolateValue', () => {
        test('interpolates numbers', () => {
            const result = interpolateValue(0, 100, 0.5, 'number');
            expect(result).toBe(50);
        });

        test('interpolates colors', () => {
            const red = new Color(1, 0, 0, 1);
            const blue = new Color(0, 0, 1, 1);
            const result = interpolateValue(red, blue, 0.5, 'color') as Color;
            
            expect(result.r).toBeCloseTo(0.5, 1);
            expect(result.g).toBe(0);
            expect(result.b).toBeCloseTo(0.5, 1);
            expect(result.a).toBe(1);
        });

        test('returns start value at t=0', () => {
            const result = interpolateValue(10, 20, 0, 'number');
            expect(result).toBe(10);
        });

        test('returns end value at t=1', () => {
            const result = interpolateValue(10, 20, 1, 'number');
            expect(result).toBe(20);
        });
    });
});
