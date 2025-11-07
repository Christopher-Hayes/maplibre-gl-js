import {easeCubicInOut} from './util';
import {interpolates, type Color} from '@maplibre/maplibre-gl-style-spec';

/**
 * Calculate the interpolation factor (t) for a transition given current time and transition bounds.
 * Returns a value between 0 and 1 representing progress through the transition.
 * 
 * @param now - Current timestamp
 * @param begin - Transition start timestamp
 * @param end - Transition end timestamp
 * @returns Interpolation factor between 0 (start) and 1 (end), eased with cubic-in-out
 */
export function calculateInterpolationFactor(now: number, begin: number, end: number): number {
    if (now < begin) {
        // Transition hasn't started yet
        return 0;
    } else if (now >= end) {
        // Transition is complete
        return 1;
    } else {
        // In progress - calculate linear factor and apply easing
        const linearT = (now - begin) / (end - begin);
        return easeCubicInOut(linearT);
    }
}

/**
 * Interpolate between two values based on the interpolation factor.
 * Handles both color and numeric interpolation.
 * 
 * @param priorValue - Starting value
 * @param currentValue - Ending value
 * @param t - Interpolation factor (0-1)
 * @param type - Type of interpolation ('color' or 'number')
 * @returns Interpolated value
 */
export function interpolateValue(
    priorValue: any,
    currentValue: any,
    t: number,
    type: 'color' | 'number'
): Color | number {
    if (type === 'color') {
        return interpolates.color(priorValue, currentValue, t);
    } else {
        return interpolates.number(priorValue, currentValue, t);
    }
}
