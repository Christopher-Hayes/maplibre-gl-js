# Feature State Transitions - Performance Optimizations

## Summary

This document describes the performance optimizations applied to make feature state transitions smoother and more efficient. The goal was to achieve butter-smooth CSS-like transitions for feature state changes.

## Optimizations Implemented

### 1. ✅ Cached Current Time at Frame Level

**Problem:** The code was calling `now()` once per feature per frame during transitions. For even just 3 features, this meant 3 redundant time calculations per frame (60 FPS = 180 calls/second).

**Solution:** 
- Call `now()` once in `TileManager.prepare()` at the start of each frame
- Pass the timestamp down through the call chain:
  - `TileManager.prepare()` → `Tile.updateFeatureStateTransitions()` 
  - `Tile.updateFeatureStateTransitions()` → `Bucket.update()`
  - `Bucket.update()` → `ProgramConfiguration.updatePaintArrays()`
  - `ProgramConfiguration.updatePaintArrays()` → `Binder.updatePaintArray()`

**Impact:** Eliminates N redundant `now()` calls per frame (where N = number of transitioning features).

**Files Changed:**
- `src/tile/tile_manager.ts`
- `src/tile/tile.ts`
- `src/data/bucket.ts`
- `src/data/bucket/circle_bucket.ts`
- `src/data/bucket/fill_bucket.ts`
- `src/data/bucket/fill_extrusion_bucket.ts`
- `src/data/bucket/line_bucket.ts`
- `src/data/bucket/symbol_bucket.ts`
- `src/data/program_configuration.ts`

### 2. ✅ Only Update Transitioning Features

**Problem:** The code was calling `bucket.update()` with ALL features that have any feature state, not just those with active transitions. This meant:
- Iterating through all features with feature state
- Checking transition state for each one
- Evaluating expressions even for features not transitioning

**Solution:**
- Added `SourceFeatureState.getTransitioningFeatures()` method that returns only features with active transitions for a given source layer
- Modified `Tile.updateFeatureStateTransitions()` to only pass transitioning features to `bucket.update()`

**Impact:** Drastically reduces the number of features processed per frame. For example, if you have 1000 features with feature state but only 3 are transitioning, this optimization reduces processing from 1000 features to 3.

**Files Changed:**
- `src/source/source_state.ts` - Added `getTransitioningFeatures()` method
- `src/tile/tile.ts` - Use `getTransitioningFeatures()` instead of getting all features

### 3. ✅ Cached Expression Evaluation Results

**Problem:** The code was evaluating expressions **twice per feature per frame**:
1. Once with `priorState` to get the starting value
2. Once with `currentState` to get the ending value

Then interpolating between them. At 60 FPS over a 300ms transition, this meant:
- 18 frames × 2 evaluations × N features = 36N expression evaluations for a single hover!

Expression evaluation can be expensive, especially for complex expressions.

**Solution:**
- Added `cachedValues` map to `FeatureStateWithTransition` type
- On the **first frame** of a transition, evaluate expressions with both states and cache the results
- On **subsequent frames**, use the cached values and only perform interpolation
- Clean up cached values when transition completes

**Impact:** Reduces expression evaluations from `2 × frames` to just `2` (only at the start). For a 300ms transition at 60 FPS, this is a **reduction from 36 evaluations to 2** - an 18x improvement!

**Files Changed:**
- `src/source/source_state.ts` - Added `cachedValues` to `FeatureStateWithTransition` type
- `src/data/program_configuration.ts` - Modified `SourceExpressionBinder.updatePaintArray()` and `CompositeExpressionBinder.updatePaintArray()` to cache and reuse evaluated values
- `src/data/program_configuration.ts` - Modified `ProgramConfiguration.updatePaintArrays()` to pass property name for caching

## Performance Impact

### Before Optimizations
For 3 features transitioning over 300ms (18 frames at 60 FPS):

- `now()` calls: 3 features × 18 frames = **54 calls**
- Features processed: All features with any state × 18 frames = **potentially hundreds**
- Expression evaluations: 3 features × 2 evaluations × 18 frames = **108 evaluations**

### After Optimizations
For the same scenario:

- `now()` calls: 1 per frame × 18 frames = **18 calls** (3x reduction)
- Features processed: Only 3 transitioning features × 18 frames = **54** (could be 10-100x reduction depending on total features)
- Expression evaluations: 3 features × 2 evaluations = **6 evaluations** (18x reduction)

### Overall Impact

The combination of these optimizations means:
- **Fewer CPU cycles** per frame (less computation)
- **More consistent frame timing** (less jitter)
- **Smoother visual transitions** (closer to CSS-quality)
- **Better scalability** (performance impact doesn't grow with total feature count, only with transitioning feature count)

## Testing

To test the optimizations:

1. Build the development version:
   ```bash
   npm run build-dev
   ```

2. Open the test example:
   ```
   test/examples/feature-state-transitions.html
   ```

3. Hover over the circles - transitions should now be noticeably smoother and more consistent

4. Check browser DevTools Performance tab to verify:
   - Consistent 60 FPS during transitions
   - Reduced CPU time in scripting
   - Fewer function calls

## Future Optimization Opportunities

### Smart Vertex Buffer Updates (Not Implemented)

Currently, when features transition, we mark the entire paint array as dirty and re-upload it to the GPU. A potential future optimization:

- Track which specific vertex ranges have changed
- Use `bufferSubData()` to upload only dirty regions
- Only mark specific ranges as needing upload

This would reduce GPU upload bandwidth, but adds complexity around:
- Tracking dirty regions per buffer
- Handling overlapping regions
- Managing buffer update coalescing

This optimization was not implemented because:
1. The other optimizations already provide significant improvement
2. For small feature counts (like the 3-circle demo), the benefit would be minimal
3. Modern GPUs handle buffer uploads efficiently
4. The added code complexity outweighs the marginal benefit for typical use cases

## Conclusion

These optimizations make feature state transitions significantly smoother by:
- Reducing redundant computations
- Only processing features that need processing
- Caching expensive expression evaluations

The result is transitions that feel much closer to CSS quality while maintaining the flexibility of feature-state driven styling.
