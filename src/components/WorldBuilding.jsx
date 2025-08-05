import React from 'react';

const WorldBuilding = ({ worldBuilding }) => {
    if (!worldBuilding || Object.keys(worldBuilding).length === 0) {
        return <div>No world-building information available.</div>
    }
    return (
        <div className="world-building">
            <h2>World Building</h2>
            <pre>{JSON.stringify(worldBuilding, null, 2)}</pre>
        </div>
    );
};

export default WorldBuilding;
