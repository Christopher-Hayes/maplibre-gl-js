import {extend} from '../util/util';
import {type Tile} from '../tile/tile';
import type {FeatureState} from '@maplibre/maplibre-gl-style-spec';

export type FeatureStates = {[featureId: string]: FeatureState};
export type LayerFeatureStates = {[layer: string]: FeatureStates};

/**
 * Represents feature state with transition timing information
 * @internal
 */
type FeatureStateWithTransition = {
    state: FeatureState;
    priorState: FeatureState | null;
    transitionBegin: number;
    transitionEnd: number;
    // Cache evaluated property values to avoid re-evaluation every frame
    // Maps property name to {prior: value, current: value}
    cachedValues?: {[property: string]: {prior: any; current: any}};
};

type FeatureStatesWithTransition = {[featureId: string]: FeatureStateWithTransition};
type LayerFeatureStatesWithTransition = {[layer: string]: FeatureStatesWithTransition};

/**
 * @internal
 * SourceFeatureState manages the state and pending changes
 * to features in a source, separated by source layer.
 * stateChanges and deletedStates batch all changes to the tile (updates and removes, respectively)
 * between coalesce() events. addFeatureState() and removeFeatureState() also update their counterpart's
 * list of changes, such that coalesce() can apply the proper state changes while agnostic to the order of operations.
 * In deletedStates, all null's denote complete removal of state at that scope
*/
export class SourceFeatureState {
    state: LayerFeatureStates;
    stateChanges: LayerFeatureStates;
    deletedStates: {};
    // Track transition state for each feature
    transitionState: LayerFeatureStatesWithTransition;

    constructor() {
        this.state = {};
        this.stateChanges = {};
        this.deletedStates = {};
        this.transitionState = {};
    }

    updateState(sourceLayer: string, featureId: number | string, newState: any, transitionSpec?: {duration: number; delay: number}, now?: number) {
        const feature = String(featureId);
        this.stateChanges[sourceLayer] = this.stateChanges[sourceLayer] || {};
        this.stateChanges[sourceLayer][feature] = this.stateChanges[sourceLayer][feature] || {};
        
        // Track transition state if transition is enabled
        // This must be done BEFORE we extend stateChanges with newState
        if (transitionSpec && (transitionSpec.duration || transitionSpec.delay) && now !== undefined) {
            this.transitionState[sourceLayer] = this.transitionState[sourceLayer] || {};
            
            // Get the complete current state before any changes
            // This is the state as it exists in this.state combined with pending stateChanges
            const currentCompleteState = {};
            
            // Start with the coalesced state
            if (this.state[sourceLayer] && this.state[sourceLayer][feature]) {
                extend(currentCompleteState, this.state[sourceLayer][feature]);
            }
            
            // Merge in any pending changes (before we add newState)
            if (this.stateChanges[sourceLayer][feature]) {
                extend(currentCompleteState, this.stateChanges[sourceLayer][feature]);
            }
            
            // Check if the state is actually changing
            let stateChanged = false;
            for (const key in newState) {
                if (currentCompleteState[key] !== newState[key]) {
                    stateChanged = true;
                    break;
                }
            }
            
            // Only create/update transition if the state is actually changing
            if (stateChanged) {
                this.transitionState[sourceLayer][feature] = {
                    state: extend({}, currentCompleteState, newState),
                    priorState: currentCompleteState,
                    transitionBegin: now + (transitionSpec.delay || 0),
                    transitionEnd: now + (transitionSpec.delay || 0) + (transitionSpec.duration || 0)
                };
            }
        }
        
        // Now extend stateChanges with the new state
        extend(this.stateChanges[sourceLayer][feature], newState);

        if (this.deletedStates[sourceLayer] === null) {
            this.deletedStates[sourceLayer] = {};
            for (const ft in this.state[sourceLayer]) {
                if (ft !== feature) this.deletedStates[sourceLayer][ft] = null;
            }
        } else {
            const featureDeletionQueued = this.deletedStates[sourceLayer] && this.deletedStates[sourceLayer][feature] === null;
            if (featureDeletionQueued) {
                this.deletedStates[sourceLayer][feature] = {};
                for (const prop in this.state[sourceLayer][feature]) {
                    if (!newState[prop]) this.deletedStates[sourceLayer][feature][prop] = null;
                }
            } else {
                for (const key in newState) {
                    const deletionInQueue = this.deletedStates[sourceLayer] && this.deletedStates[sourceLayer][feature] && this.deletedStates[sourceLayer][feature][key] === null;
                    if (deletionInQueue) delete this.deletedStates[sourceLayer][feature][key];
                }
            }
        }
    }

    removeFeatureState(sourceLayer: string, featureId?: number | string, key?: string) {
        const sourceLayerDeleted = this.deletedStates[sourceLayer] === null;
        if (sourceLayerDeleted) return;

        const feature = String(featureId);

        this.deletedStates[sourceLayer] = this.deletedStates[sourceLayer] || {};

        if (key && featureId !== undefined) {
            if (this.deletedStates[sourceLayer][feature] !== null) {
                this.deletedStates[sourceLayer][feature] = this.deletedStates[sourceLayer][feature] || {};
                this.deletedStates[sourceLayer][feature][key] = null;
            }
        } else if (featureId !== undefined) {
            const updateInQueue = this.stateChanges[sourceLayer] && this.stateChanges[sourceLayer][feature];
            if (updateInQueue) {
                this.deletedStates[sourceLayer][feature] = {};
                for (key in this.stateChanges[sourceLayer][feature]) this.deletedStates[sourceLayer][feature][key] = null;

            } else {
                this.deletedStates[sourceLayer][feature] = null;
            }
        } else {
            this.deletedStates[sourceLayer] = null;
        }

    }

    getState(sourceLayer: string, featureId: number | string) {
        const feature = String(featureId);
        const base = this.state[sourceLayer] || {};
        const changes = this.stateChanges[sourceLayer] || {};

        const reconciledState = extend({}, base[feature], changes[feature]);

        //return empty object if the whole source layer is awaiting deletion
        if (this.deletedStates[sourceLayer] === null) return {};
        else if (this.deletedStates[sourceLayer]) {
            const featureDeletions = this.deletedStates[sourceLayer][featureId];
            if (featureDeletions === null) return {};
            for (const prop in featureDeletions) delete reconciledState[prop];
        }
        return reconciledState;
    }

    /**
     * Get the transition state for a feature, including prior state and timing
     */
    getFeatureTransitionState(sourceLayer: string, featureId: number | string): FeatureStateWithTransition | null {
        const feature = String(featureId);
        if (!this.transitionState[sourceLayer] || !this.transitionState[sourceLayer][feature]) {
            return null;
        }
        return this.transitionState[sourceLayer][feature];
    }

    /**
     * Check if there are any active transitions
     */
    hasTransitions(now: number): boolean {
        for (const sourceLayer in this.transitionState) {
            for (const feature in this.transitionState[sourceLayer]) {
                const transState = this.transitionState[sourceLayer][feature];
                if (now < transState.transitionEnd) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Get all features with active transitions for a specific source layer
     * Returns a FeatureStates object containing only features currently transitioning
     */
    getTransitioningFeatures(sourceLayer: string, now: number): FeatureStates {
        const result: FeatureStates = {};
        
        if (!this.transitionState[sourceLayer]) {
            return result;
        }
        
        for (const feature in this.transitionState[sourceLayer]) {
            const transState = this.transitionState[sourceLayer][feature];
            if (now < transState.transitionEnd) {
                // Get the current coalesced state for this feature
                result[feature] = this.getState(sourceLayer, feature);
            }
        }
        
        return result;
    }

    /**
     * Clean up completed transitions
     */
    cleanupTransitions(now: number) {
        for (const sourceLayer in this.transitionState) {
            const featuresToDelete = [];
            for (const feature in this.transitionState[sourceLayer]) {
                const transState = this.transitionState[sourceLayer][feature];
                if (now >= transState.transitionEnd) {
                    // Mark for deletion - this also cleans up cachedValues
                    featuresToDelete.push(feature);
                }
            }
            // Remove completed transitions to prevent memory growth
            for (const feature of featuresToDelete) {
                delete this.transitionState[sourceLayer][feature];
            }
            // Clean up empty source layers
            if (Object.keys(this.transitionState[sourceLayer]).length === 0) {
                delete this.transitionState[sourceLayer];
            }
        }
    }

    initializeTileState(tile: Tile, painter: any) {
        tile.setFeatureState(this.state, painter, this);
    }

    coalesceChanges(tiles: {
        [_ in any]: Tile;
    }, painter: any) {
        //track changes with full state objects, but only for features that got modified
        const featuresChanged: LayerFeatureStates = {};

        for (const sourceLayer in this.stateChanges) {
            this.state[sourceLayer]  = this.state[sourceLayer] || {};
            const layerStates = {};
            for (const feature in this.stateChanges[sourceLayer]) {
                if (!this.state[sourceLayer][feature]) this.state[sourceLayer][feature] = {};
                extend(this.state[sourceLayer][feature], this.stateChanges[sourceLayer][feature]);
                layerStates[feature] = this.state[sourceLayer][feature];
            }
            featuresChanged[sourceLayer] = layerStates;
        }

        for (const sourceLayer in this.deletedStates) {
            this.state[sourceLayer]  = this.state[sourceLayer] || {};
            const layerStates = {};

            if (this.deletedStates[sourceLayer] === null) {
                for (const ft in this.state[sourceLayer]) {
                    layerStates[ft] = {};
                    this.state[sourceLayer][ft] = {};
                }
            } else {
                for (const feature in this.deletedStates[sourceLayer]) {
                    const deleteWholeFeatureState = this.deletedStates[sourceLayer][feature] === null;
                    if (deleteWholeFeatureState) this.state[sourceLayer][feature] = {};
                    else {
                        for (const key of Object.keys(this.deletedStates[sourceLayer][feature])) {
                            delete this.state[sourceLayer][feature][key];
                        }
                    }
                    layerStates[feature] = this.state[sourceLayer][feature];
                }
            }

            featuresChanged[sourceLayer] = featuresChanged[sourceLayer] || {};
            extend(featuresChanged[sourceLayer], layerStates);
        }

        this.stateChanges = {};
        this.deletedStates = {};

        if (Object.keys(featuresChanged).length === 0) return;

        for (const id in tiles) {
            const tile = tiles[id];
            tile.setFeatureState(featuresChanged, painter, this);
        }
    }
}
