# Feature State Transitions Implementation

## Summary

This implementation adds smooth transition support for the `setFeatureState()` API in MapLibre GL JS, matching the animation capabilities of `setPaintProperty()`. When feature states are updated, they now smoothly animate based on the configured transition settings.

## Changes Made

### 1. Source Feature State Management (`src/source/source_state.ts`)

**Enhanced `SourceFeatureState` class to track transition timing:**
- Added `transitionState` field to store prior feature states and transition timing information
- Modified `updateState()` to accept transition parameters (duration, delay) and current time
  - Captures complete prior state BEFORE extending stateChanges
  - Combines coalesced state with pending changes for accurate prior state
- Added helper methods:
  - `getFeatureTransitionState()` - Get transition state for a specific feature
  - `hasTransitions()` - Check if any transitions are currently active
  - `cleanupTransitions()` - Remove completed transition entries (prevents memory leaks)

### 2. Transition Configuration Flow

**Updated the call chain to pass transition parameters:**
- `Style.setFeatureState()` - Now passes global transition config and current time
- `TileManager.setFeatureState()` - Forwards transition params to source state
- `TileManager.hasTransition()` - Checks for active feature-state transitions
- `Tile.setFeatureState()` - Passes source feature state to buckets
- All bucket `update()` methods - Accept and forward source feature state

### 3. Interpolation Logic (`src/data/program_configuration.ts`)

**Utilized existing interpolation logic for feature state values:**
- Updated `SourceExpressionBinder.updatePaintArray()` to:
  - Check for active transitions using transition end time
  - Only call `now()` when checking if still transitioning
  - Evaluate expressions with both prior and current feature states
  - Interpolate between values using existing `interpolates.number` and `interpolates.color` functions with cubic easing
- Updated `CompositeExpressionBinder.updatePaintArray()` with the same interpolation logic

### 4. Continuous Rendering

The existing render loop infrastructure already supports this:
- `Style.hasTransitions()` checks `TileManager.hasTransition()`
- `TileManager.hasTransition()` now includes feature-state transition checks
- Map continues repainting while transitions are active

## How It Works

1. When `map.setFeatureState()` is called, it captures:
   - The new feature state values
   - The prior feature state values
   - Global transition configuration (duration, delay)
   - Current timestamp

2. This transition data is stored in `SourceFeatureState.transitionState`

3. When tiles are updated:
   - The source feature state object is passed to buckets
   - Expression binders check for active transitions for each feature
   - If in transition, they:
     - Evaluate the expression with prior state → `priorValue`
     - Evaluate the expression with current state → `currentValue`
     - Calculate interpolation factor `t` based on elapsed time
     - Interpolate: `value = priorValue + (currentValue - priorValue) * easeCubicInOut(t)`
   - The interpolated value is written to vertex buffers

4. The map continues rendering until transitions complete

## Scope

This implementation matches the capabilities of `setPaintProperty()` transitions:
- Only properties that support transitions with `setPaintProperty()` will transition with `setFeatureState()`
- Uses the same easing function (cubic-in-out)
- Respects global transition configuration
- Data-driven properties that use `feature-state` expressions will now smoothly transition

## Testing

- Unit tests in `test/unit/source/feature_state_transitions.test.ts`
- Example demo in `test/examples/feature-state-transitions.html`
- Tests verify:
  - Prior state tracking
  - Transition timing
  - Multiple concurrent transitions
  - Cleanup after completion

## Example Usage

```javascript
const map = new maplibregl.Map({
    // ... map config ...
    style: {
        // ... style config ...
        transition: {
            duration: 300,
            delay: 0
        },
        layers: [{
            id: 'points',
            type: 'circle',
            paint: {
                'circle-color': [
                    'case',
                    ['feature-state', 'hover'],
                    '#ff0000',  // Red when hovering
                    '#0000ff'   // Blue normally
                ]
            }
        }]
    }
});

// This will now smoothly transition from blue to red over 300ms
map.setFeatureState(
    {source: 'points', id: featureId},
    {hover: true}
);
```

## Notes

- Transitions are only applied when transition spec includes duration or delay
- Transitions work for both color and numeric properties
- The implementation is consistent with existing paint property transitions
- Performance impact is minimal as interpolation only happens for features with active transitions
