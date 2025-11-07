import {describe, test, expect} from 'vitest';
import {SourceFeatureState} from './source_state';

describe('SourceFeatureState transitions', () => {
    test('tracks prior state and transition timing when transition is enabled', () => {
        const sourceState = new SourceFeatureState();
        const now = 1000;
        const transition = {duration: 300, delay: 0};
        
        // Set initial state
        sourceState.updateState('layer1', 'feature1', {hover: false}, transition, now);
        
        // Update state with transition
        sourceState.updateState('layer1', 'feature1', {hover: true}, transition, now + 100);
        
        const transState = sourceState.getFeatureTransitionState('layer1', 'feature1');
        
        expect(transState).toBeDefined();
        expect(transState).not.toBe(null);
        if (transState) {
            expect(transState.priorState).toEqual({hover: false});
            expect(transState.state).toEqual({hover: true});
            expect(transState.transitionBegin).toBe(now + 100);
            expect(transState.transitionEnd).toBe(now + 100 + 300);
        }
    });

    test('hasTransitions returns true during active transitions', () => {
        const sourceState = new SourceFeatureState();
        const now = 1000;
        const transition = {duration: 300, delay: 0};
        
        sourceState.updateState('layer1', 'feature1', {hover: true}, transition, now);
        
        // During transition
        expect(sourceState.hasTransitions(now + 150)).toBe(true);
        
        // After transition completes
        expect(sourceState.hasTransitions(now + 400)).toBe(false);
    });

    test('cleanupTransitions removes completed transitions', () => {
        const sourceState = new SourceFeatureState();
        const now = 1000;
        const transition = {duration: 300, delay: 0};
        
        sourceState.updateState('layer1', 'feature1', {hover: false}, transition, now);
        sourceState.updateState('layer1', 'feature1', {hover: true}, transition, now + 100);
        
        let transState = sourceState.getFeatureTransitionState('layer1', 'feature1');
        expect(transState).not.toBe(null);
        if (transState) {
            expect(transState.priorState).toEqual({hover: false});
        }
        
        // Clean up after transition completes - should remove the entire entry
        sourceState.cleanupTransitions(now + 500);
        
        transState = sourceState.getFeatureTransitionState('layer1', 'feature1');
        expect(transState).toBe(null);
    });

    test('does not track transitions when no transition spec provided', () => {
        const sourceState = new SourceFeatureState();
        const now = 1000;
        
        sourceState.updateState('layer1', 'feature1', {hover: true});
        
        const transState = sourceState.getFeatureTransitionState('layer1', 'feature1');
        expect(transState).toBe(null);
    });

    test('handles multiple features with different transition states', () => {
        const sourceState = new SourceFeatureState();
        const now = 1000;
        const transition = {duration: 300, delay: 0};
        
        sourceState.updateState('layer1', 'feature1', {hover: true}, transition, now);
        sourceState.updateState('layer1', 'feature2', {hover: true}, transition, now + 50);
        
        const trans1 = sourceState.getFeatureTransitionState('layer1', 'feature1');
        const trans2 = sourceState.getFeatureTransitionState('layer1', 'feature2');
        
        expect(trans1).not.toBe(null);
        expect(trans2).not.toBe(null);
        if (trans1 && trans2) {
            expect(trans1.transitionBegin).toBe(now);
            expect(trans2.transitionBegin).toBe(now + 50);
        }
        
        // First transition active, second still active
        expect(sourceState.hasTransitions(now + 200)).toBe(true);
        
        // First complete, second still active
        expect(sourceState.hasTransitions(now + 325)).toBe(true);
        
        // Both complete
        expect(sourceState.hasTransitions(now + 400)).toBe(false);
    });
});
