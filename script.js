const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.lang = 'en-US';
recognition.interimResults = false;
recognition.maxAlternatives = 1;
let currentObject = null; // Add this line at the top of your script to keep track of the current object
let isAnimating = false;
const commandHistory = [];
let currentCommandIndex = -1;
const colorChangeHistory = [];
const redoColorChangeHistory = [];


const socket = io();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('container').appendChild(renderer.domElement);



camera.position.z= 5;

function updateTextBox(message) {
    const textBox = document.getElementById('textBox');
    textBox.innerHTML += message + '<br>';
    textBox.scrollTop = textBox.scrollHeight; // Scrolls to the bottom

}

function updateTextBox1(message) {
    const textBox = document.getElementById('textBox1');
    textBox.innerHTML += message + '<br>';
    textBox.scrollTop = textBox.scrollHeight; // Scrolls to the bottom
}


function animate() {
    requestAnimationFrame(animate);
    if (isAnimating && currentObject) {
        // Add your animation logic here. For example, rotating the object:
        currentObject.rotation.x += 0.01;
        currentObject.rotation.y += 0.01;
    }
    renderer.render(scene, camera);
}
animate();
let currentObjectDetails = null;
let model = null;


document.getElementById('startWebcam').addEventListener('click', async () => {
    console.log("Start Webcam button clicked.");

    const video = document.getElementById('webcam');
    video.style.display = 'block';

    // Try to get user media
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
        video.srcObject = stream;

        // Initialize the Handtrack.js model
        handTrack.startVideo(video)
            .then(status => {
                console.log("Handtrack startVideo status:", status);
                if (status) {
                    handTrack.load().then(lmodel => {
                        console.log("Handtrack model loaded.");
                        model = lmodel;
                        runDetection();
                    });
                }
            });
    } catch (err) {
        console.error("Error accessing webcam:", err);
    }
});

function recordUserAction(intent, data) {
    const command = { intent, data };
    commandHistory.push(command);
    currentCommandIndex = commandHistory.length - 1;
}


// Run detection on the video feed
function runDetection() {
    model.detect(document.getElementById('webcam'))
        .then(predictions => {
            if (predictions.length > 0) {
                const gesture = predictions[0].label;
                handleGesture(gesture);
            }
            // Run the next detection
            runDetection();
        });
}

// Handle detected gestures
function handleGesture(gesture) {
    if (gesture === 'closed') {
        stopAnimation();
    } else if (gesture === 'open') {
        startAnimation();
    } else if (gesture== 'point'){
        deleteCurrentObject();
    }
}
// ... (rest of your existing code)




document.getElementById('startListening').addEventListener('click', () => {
    recognition.start();
});

recognition.addEventListener('result', (event) => {
    const transcript = event.results[0][0].transcript;
    console.log(`Recognized text: ${transcript}`);
    updateTextBox1(`Recognized text: ${transcript}`);
    socket.emit('recognizedText', transcript);
});

recognition.addEventListener('error', (event) => {
    console.error(`Error occurred in recognition: ${event.error}`);
});

socket.on('createObject', (data) => {
    const { intent, entities } = data;
    if (intent === 'create_object') {
        const objectType = entities['object_type:object_type'][0]?.value.toLowerCase();
        const dimensions = {};

        // Debugging: Log the received entities
        console.log('Received entities:', JSON.stringify(entities));

        const dimensionTypes = entities['dimension_type:dimension_type'] || [];
        const dimensionValues = entities['dimension_value:dimension_value'] || [];

        for (let i = 0; i < dimensionTypes.length; i++) {
            const dimensionType = dimensionTypes[i]?.value;
            const dimensionValue = parseFloat(dimensionValues[i]?.value);
            if (dimensionType && dimensionValue) {
                dimensions[dimensionType] = dimensionValue;
            }
        }

        // Debugging: Log the collected dimensions
        console.log(`Collected dimensions: ${JSON.stringify(dimensions)}`);
        createObject(objectType, dimensions);
    }
});

socket.on('resizeObject', (data) => {
    const { intent, entities } = data;
    if (intent === 'resize_object') {
        const operationType = entities['operation_type:operation_type'][0]?.value.toLowerCase();
        const dimensions = {};

        // Debugging: Log the received entities
        console.log('Received entities:', JSON.stringify(entities));

        const dimensionTypes = entities['dimension_type:dimension_type'] || [];
        const dimensionValues = entities['dimension_value:dimension_value'] || [];

        for (let i = 0; i < dimensionTypes.length; i++) {
            const dimensionType = dimensionTypes[i]?.value;
            let dimensionValue = dimensionValues[i]?.value;

            // Check if the value is a percentage
            if (dimensionValue.endsWith('%')) {
                dimensions[dimensionType] = dimensionValue;
            } else {
                dimensions[dimensionType] = parseFloat(dimensionValue);
            }
        }

        // Debugging: Log the collected dimensions
        console.log(`Collected dimensions: ${JSON.stringify(dimensions)}`);
        
        resizeObject(operationType, dimensions);
    }
});

socket.on('rotateObject', (data) => {
    const { intent, entities } = data;
    if (intent === 'rotate_object') {
        const axisEntities = entities['axis:axis'] || [];
        const degreeEntities = [...(entities['dimension_value:dimension_value'] || []), ...(entities['degree:degree'] || [])];

        // Initialize a map with default rotation degrees for each axis
        const axisDegreeMap = { x: null, y: null, z: null };

        // Debugging: Log the entities
        console.log('Axis Entities:', axisEntities);
        console.log('Degree Entities:', degreeEntities);

        // If there is only one degree entity and multiple axis entities, distribute the degree across all axes
        if (degreeEntities.length === 1 && axisEntities.length > 1) {
            const degreeValue = parseFloat(degreeEntities[0].value);
            axisEntities.forEach(axisEntity => {
                const axis = axisEntity.value.toLowerCase().charAt(0);
                axisDegreeMap[axis] = degreeValue;
            });
        } else {
            // Assign degrees to the corresponding axis
            axisEntities.forEach((axisEntity, index) => {
                const axis = axisEntity.value.toLowerCase().charAt(0);
                const degreeEntity = degreeEntities[index]; // Get the corresponding degree entity by index
                const degreeValue = degreeEntity ? parseFloat(degreeEntity.value) : null;

                axisDegreeMap[axis] = degreeValue;
            });
        }

        // Debugging: Log the final axis-degree map
        console.log('Axis-Degree Map:', axisDegreeMap);

        rotateObject(axisDegreeMap);
    }
});

function rotateObject(axisDegreeMap) {
    if (!currentObject) {
        console.warn('No object to rotate.');
        return;
    }

    Object.entries(axisDegreeMap).forEach(([axis, degree]) => {
        if (degree === null) {
            console.warn(`No degree specified for ${axis}-axis.`);
            return;
        }

        const radians = THREE.MathUtils.degToRad(degree);

        if (axis === 'x') {
            currentObject.rotation.x += radians;
        } else if (axis === 'y') {
            currentObject.rotation.y += radians;
        } else if (axis === 'z') {
            currentObject.rotation.z += radians;
        }

        updateTextBox(`Rotated object along ${axis}-axis by ${degree} degrees.`);
    });
}






socket.on('deleteObject', (data) => {
    const { intent } = data;
    if (intent === 'delete_object') {
        deleteCurrentObject();
    }
});
socket.on('moveObject', (data) => {
    const { intent, entities } = data;
    if (intent === 'move_object') {
        const axisArray = entities['axis:axis'];
        let distanceEntity = entities['dimension_value:dimension_value'];

        if (axisArray && axisArray.length > 0 && distanceEntity && distanceEntity.length > 0) {
            const axis = axisArray[0]?.value.toLowerCase().charAt(0);  // Extract the first character as the axis
            const distance = parseFloat(distanceEntity[0]?.value);
            moveObject(axis, distance);
        } else {
            console.warn('Missing axis or distance information');
        }
    }
});

socket.on('changeShapeColor', (data) => {
    const { intent, entities } = data;
    if (intent === 'change_colour') {
        const colorTypeEntity = entities['colour_type:colour_type'][0]?.value.toLowerCase();
        changeShapeColor(colorTypeEntity);
    } else {
        console.warn('Missing or incorrect data for changing color.');
    }
});

socket.on('undo', (data) => {
    const { intent } = data;
    if (intent === 'undo') {
        // Handle undo logic here
        // Capture the current state before undoing
        undo(); // Undo the last action
    }
});

socket.on('redo', (data) => {
    const { intent } = data;
    if (intent === 'redo') {
        // Handle redo logic here
        redo(); // Redo the last undone action
    }
});






      
const shapeFunctionMap = {
    'cube': createCube,
    'sphere': createSphere,
    'pyramid': createPyramid,
    'cone': createCone,
    'cylinder': createCylinder,
    'cuboid': createRectangle
};

const dimensionSynonyms = {
    'edges': 'size',
    'sides': 'size',
    'radius': 'radius',
    'height': 'height',
    'tall': 'height',
    'base': 'base',
    'length': 'length',
    'width': 'width',
    'depth': 'depth', 
    'breadth': 'width',
   
};
const defaultDimensions = {
    'cube': { 'size': 1 },
    'sphere': { 'radius': 1 },
    'pyramid': { 'height': 1 },
    'cone': { 'base': 1, 'height': 1 },
    'cylinder': { 'radius': 1, 'height': 1 },
    'cuboid': { 'length': 1, 'width': 1 , 'depth': 3 }
};

function levenshteinDistance(a, b) {
    const matrix = [];

    let i;
    for (i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    let j;
    for (j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (i = 1; i <= b.length; i++) {
        for (j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
            }
        }
    }

    return matrix[b.length][a.length];
}

function findClosestDimensionSynonym(dimension) {
    let minDistance = Infinity;
    let closestSynonym = null;

    for (const synonym of Object.keys(dimensionSynonyms)) {
        const distance = levenshteinDistance(dimension, synonym);
        if (distance < minDistance) {
            minDistance = distance;
            closestSynonym = synonym;
        }
    }

    return closestSynonym;
}


function createObject(shapeType, dimensions) {
    const shapeFunction = shapeFunctionMap[shapeType];
    if (!shapeFunction) {
        console.error(`Unsupported shape type: ${shapeType}`);
        return;
    }

    // Start with default dimensions
    const normalizedDimensions = { ...defaultDimensions[shapeType] };

    // Update with user-specified dimensions
    for (const [key, value] of Object.entries(dimensions)) {
        const closestSynonym = findClosestDimensionSynonym(key);
        const normalizedKey = dimensionSynonyms[closestSynonym] || key;
        normalizedDimensions[normalizedKey] = value;
    }

    // Store the details of the current object
    currentObjectDetails = {
        type: shapeType,
        dimensions: normalizedDimensions
    };
    getCurrentObjectDetails();

    shapeFunction(normalizedDimensions);
    console.log(`Creating object of type ${shapeType} with dimensions ${JSON.stringify(normalizedDimensions)}`);
    updateTextBox(`Creating object of type ${shapeType} with dimensions ${JSON.stringify(normalizedDimensions)}`);

}
function getCurrentObjectDetails() {
    return currentObjectDetails;
}

function resizeObject(operationType, dimensions) {
    if (!currentObjectDetails) {
        console.warn('No object to resize.');
        return;
    }

    const { type, dimensions: currentDimensions } = currentObjectDetails;

    console.log(`Current dimensions before resize: ${JSON.stringify(currentDimensions)}`);
    updateTextBox(`Current dimensions before resize: ${JSON.stringify(currentDimensions)}`);


    // Perform the resizing operation here
    for (const [key, value] of Object.entries(dimensions)) {
        const closestSynonym = findClosestDimensionSynonym(key);
        const normalizedKey = dimensionSynonyms[closestSynonym] || key;
        operationType= operationType.toLowerCase();

        if (currentDimensions.hasOwnProperty(normalizedKey)) {
            let changeValue = value;
            if (typeof value === 'string' && value.endsWith('%')) {
                const percentage = parseFloat(value.slice(0, -1));
                changeValue = (percentage / 100) * currentDimensions[normalizedKey];
                console.log(`Calculated change value for ${normalizedKey}: ${changeValue}`);
            }
           

            if (operationType === 'enlarge' ||  operationType ===  'bigger' ||  operationType ===  'boost' || operationType === 'expand' || operationType ===  'grow' || operationType === 'amplify' || operationType ===  'increase') {
                currentDimensions[normalizedKey] += changeValue;
            } else if (operationType === 'shrink' || operationType === 'reduce' || operationType === 'diminish' ||operationType === 'downsize' ||operationType === 'lessen' ||operationType === 'contract' || operationType === 'minimize' ||operationType === 'decrease') {
                currentDimensions[normalizedKey] = Math.max(0, currentDimensions[normalizedKey] - changeValue);
            } else if (operationType === 'resize' ||operationType === 'alter' ||operationType === 'revise' ||operationType === 'transform' ||operationType === 'adjust' ||operationType === 'change') {
                currentDimensions[normalizedKey] = changeValue;
            }
        }
    }

    console.log(`New dimensions after resize: ${JSON.stringify(currentDimensions)}`);
    updateTextBox(`New dimensions after resize: ${JSON.stringify(currentDimensions)}`);


    // Recreate the object with the new dimensions
    createObject(type, currentDimensions);

    // Update the current object details
    currentObjectDetails = { type, dimensions: currentDimensions };
}




function deleteCurrentObject() {
    if (currentObject) {
        scene.remove(currentObject);
        currentObject.geometry.dispose();
        currentObject.material.dispose();
        currentObject = null;
        currentObjectDetails = null;
        console.log('Deleted the current object.');
        updateTextBox('Deleted the current object.');

    } else {
        console.warn('No object to delete.');
    }
}

function startAnimation() {
    if (currentObject) {
        isAnimating = true;
        console.log('Animation started.');
    } else {
        console.warn('No object to animate.');
    }
}

function stopAnimation() {
    isAnimating = false;
    console.log('Animation stopped.');
}


function moveObject(axis, distance) {
    if (!currentObject) {
        console.warn('No object to move.');
        return;
    }

    // Normalize the axis
    const normalizedAxis = axis.toLowerCase();

    if (!['x', 'y', 'z'].includes(normalizedAxis)) {
        // Remove the following line to prevent the "Invalid axis" message
        // console.warn('Invalid axis.');
        return;
    }

    // Convert distance from centimeters to your scene's unit of measure, e.g., meters.
    const distanceInMeters = distance / 25;

    // Determine the translation vector based on the axis
    let translationVector;
    if (normalizedAxis === 'x') {
        translationVector = new THREE.Vector3(distanceInMeters, 0, 0);
    } else if (normalizedAxis === 'y') {
        translationVector = new THREE.Vector3(0, distanceInMeters, 0);
    } else if (normalizedAxis === 'z') {
        translationVector = new THREE.Vector3(0, 0, distanceInMeters);
    }

    // Apply the translation to the object
    currentObject.position.add(translationVector);
    updateTextBox(`Moved object along ${normalizedAxis}-axis by ${distance} centimeters.`);
}



// Function to change the color of the current cube
function changeShapeColor(colorTypeEntity) {
    console.log(`Changing color to: ${colorTypeEntity}`);
    if (currentObject) {
        let color;

        switch (colorTypeEntity) {
            case 'red':
                color = 0xff0000; // Red
                break;
            case 'yellow':
                color = 0xffff00; // Yellow
                break;
            case 'blue':
                color = 0x0000ff; // Blue
                break;
            case 'green':
                color = 0x00ff00; // Green
                break;
            case 'purple':
                color = 0x800080; // Purple
                break;
            default:
                console.warn('Invalid color type.');
                return;
        }

        // Store the current color in the color change history
        if (currentObject instanceof THREE.Group) {
            const colors = currentObject.children.map(child => {
                if (child instanceof THREE.Mesh) {
                    return child.material.color.getHex();
                }
            });
            colorChangeHistory.push(colors);
        } else if (currentObject instanceof THREE.Mesh) {
            colorChangeHistory.push(currentObject.material.color.getHex());
        }

        // Apply the new color
        if (currentObject instanceof THREE.Group) {
            currentObject.children.forEach(child => {
                if (child instanceof THREE.Mesh) {
                    child.material.color.setHex(color);
                }
            });
        } else if (currentObject instanceof THREE.Mesh) {
            currentObject.material.color.setHex(color);
        }

        // Record the user action for color change
        recordUserAction('change_colour', { colorTypeEntity });

        renderer.render(scene, camera);
    } else {
        console.warn('No shape to change color.');
    }
}



function undo() {
    if (currentCommandIndex > 0) {
        currentCommandIndex--;
        const previousCommand = commandHistory[currentCommandIndex];
        executeUndoAction(previousCommand);
    }
}

function redo() {
    if (currentCommandIndex < commandHistory.length - 1) {
        currentCommandIndex++;
        const nextCommand = commandHistory[currentCommandIndex];
        executeRedoAction(nextCommand);
    }
}

function executeUndoAction(command) {
    const { intent, data } = command;

    if (intent === 'change_colour') {
        if (currentObject && colorChangeHistory.length > 0) {
            const previousColors = colorChangeHistory.pop();

            // Store the current colors in redo history
            if (currentObject instanceof THREE.Group) {
                const currentColors = currentObject.children.map(child => {
                    if (child instanceof THREE.Mesh) {
                        return child.material.color.getHex();
                    }
                });
                redoColorChangeHistory.push(currentColors);
            } else if (currentObject instanceof THREE.Mesh) {
                redoColorChangeHistory.push(currentObject.material.color.getHex());
            }

            if (currentObject instanceof THREE.Group) {
                currentObject.children.forEach((child, index) => {
                    if (child instanceof THREE.Mesh) {
                        child.material.color.setHex(previousColors[index]);
                    }
                });
            } else if (currentObject instanceof THREE.Mesh) {
                currentObject.material.color.setHex(previousColors);
            }
            renderer.render(scene, camera);
        }
    }
    // Add cases for other intents as needed.
}

function executeRedoAction(command) {
    const { intent, data } = command;

    if (intent === 'change_colour') {
        if (currentObject && redoColorChangeHistory.length > 0) {
            const nextColors = redoColorChangeHistory.pop();

            // Store the current colors in undo history
            if (currentObject instanceof THREE.Group) {
                const currentColors = currentObject.children.map(child => {
                    if (child instanceof THREE.Mesh) {
                        return child.material.color.getHex();
                    }
                });
                colorChangeHistory.push(currentColors);
            } else if (currentObject instanceof THREE.Mesh) {
                colorChangeHistory.push(currentObject.material.color.getHex());
            }

            if (currentObject instanceof THREE.Group) {
                currentObject.children.forEach((child, index) => {
                    if (child instanceof THREE.Mesh) {
                        child.material.color.setHex(nextColors[index]);
                    }
                });
            } else if (currentObject instanceof THREE.Mesh) {
                currentObject.material.color.setHex(nextColors);
            }
            renderer.render(scene, camera);
        }
    }
    // Add cases for other intents as needed.
}




// Function to create a cube in Three.js
function createCube({ size }) {
    scene.remove.apply(scene, scene.children);

    if (isNaN(size) || size <= 0) {
        console.error('Invalid size for 3D model. Please check the size value.');
        return;
    }

    const geometry = new THREE.BoxGeometry(size, size, size);
    const cubeMaterials = createDimensionalMaterial(size);

    const cube = new THREE.Mesh(geometry, cubeMaterials);

    // Create an EdgesGeometry to highlight only the cube's edges
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 }); // Line color for the edges

    const edgeMesh = new THREE.LineSegments(edges, lineMaterial);

    const group = new THREE.Group();
    group.add(cube);
    group.add(edgeMesh);

    const ambientLight = new THREE.AmbientLight(0x404040); // Ambient light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1); // Directional light
    directionalLight.position.set(2, 2, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth * 2, window.innerHeight * 2);

    scene.add(group);
    scene.add(ambientLight);
    scene.add(directionalLight);

    camera.position.set(size * 1.5, size * 1.5, size * 1.5);
    camera.lookAt(size / 2, size / 2, size / 2);
    
    function createDimensionalMaterial(size) {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.width = 256;
        canvas.height = 256;
        context.fillStyle = "white";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.font = "30px Arial";
        context.fillStyle = "black";
        context.fillText(`${size} cm`, 20, 128);
    
        const texture = new THREE.CanvasTexture(canvas);
        return new THREE.MeshLambertMaterial({ map: texture, color: 0xFF4500 });
    }
    

    currentObject = group;
}


// Function to create a sphere in Three.js
function createSphere({ radius }) {
    scene.remove.apply(scene, scene.children);

    if (isNaN(radius) || radius <= 0) {
        console.error('Invalid radius for 3D model. Please check the radius value.');
        return;
    }

    const standardRadius = 2; // Set the standard radius for the sphere

    const geometry = new THREE.SphereGeometry(standardRadius, 32, 32);

    const sphereMaterials = createFixedDimensionMaterial(`${radius}cm`);

    const sphere = new THREE.Mesh(geometry, sphereMaterials);

    const ambientLight = new THREE.AmbientLight(0x404040); // Ambient light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // Directional light
    directionalLight.position.set(2, 2, 5);

    scene.add(sphere);
    scene.add(ambientLight);
    scene.add(directionalLight);

    function createFixedDimensionMaterial(dimension) {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.width = 256;
        canvas.height = 256;
        context.fillStyle = "white";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.font = "20px Arial";
        context.fillStyle = "black";
        context.fillText(dimension, 30, 128);

        const texture = new THREE.CanvasTexture(canvas);
        return new THREE.MeshLambertMaterial({ map: texture, color:0xffa500 }); // Change color here
    }
    
    // Set the camera position and lookAt for the sphere
    camera.position.set(0, 0, standardRadius * 3.5);
    camera.lookAt(0, 0, 0);
   
    // Set the current object to the sphere
    currentObject = sphere;
    
    // Add an animation loop to continuously update the sphere's rotation
}




// Function to create a pyramid in Three.js
function createPyramid({ height }) {
    scene.remove.apply(scene, scene.children);

    if (isNaN(height) || height <= 0) {
        console.error('Invalid height for 3D model. Please check the height value.');
        return;
    }

    const standardHeight = 4; // Set the standard height for the pyramid
    const standardRadius = standardHeight / 2;

    const geometry = new THREE.CylinderGeometry(0, standardRadius, standardHeight, 4); // Use CylinderGeometry to create a pyramid shape

    const pinkColor = 0xFF69B4; // Pink color

    const pyramidMaterials = new THREE.MeshLambertMaterial({ color: pinkColor });

    const pyramid = new THREE.Mesh(geometry, pyramidMaterials);

    // Create an EdgesGeometry to highlight the pyramid's edges
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 }); // Line color for the edges

    const edgeMesh = new THREE.LineSegments(edges, lineMaterial);

    const group = new THREE.Group();
    group.add(pyramid);
    group.add(edgeMesh);

    const ambientLight = new THREE.AmbientLight(0x404040); // Ambient light
    const directionalLight = new THREE.DirectionalLight(0xffffff,1); // Directional light
    directionalLight.position.set(2, 2, 5);

    scene.add(group);
    scene.add(ambientLight);
    scene.add(directionalLight);

    // Set the camera position and look at properties based on the pyramid's height
    camera.position.set(0, 0, standardHeight * 2);
    camera.lookAt(0, 0, 0);

    // Set the current object to the pyramid
    currentObject = group;
}






// Function to create a cone in Three.js
function createCone({ base, height }) {
    scene.remove.apply(scene, scene.children);

    if (isNaN(base) || base <= 0 || isNaN(height) || height <= 0) {
        console.error('Invalid base or height for 3D model. Please check the values.');
        return;
    }

    const geometry = new THREE.ConeGeometry(base, height, 32);

    const coneMaterials = new THREE.MeshLambertMaterial({ color: 0xffff00 }); // Change the color here

    const cone = new THREE.Mesh(geometry, coneMaterials);

    const ambientLight = new THREE.AmbientLight(0x404040); // Ambient light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1); // Directional light
    directionalLight.position.set(2, 2, 5);

    scene.add(cone);
    scene.add(ambientLight);
    scene.add(directionalLight);

    camera.position.set(0, 0, height * 3);
    camera.lookAt(0, 0, 0);

    // Set the current object to the cone
    currentObject = cone;
}



// Function to create a cylinder in Three.js
function createCylinder({ radius, height }) {
    scene.remove.apply(scene, scene.children);

    if (isNaN(radius) || isNaN(height) || radius <= 0 || height <= 0) {
        console.error('Invalid dimensions for 3D model. Please check the dimensions.');
        return;
    }

    const standardRadius = 2; // Set the standard radius for the cylinder
    const standardHeight = 4; // Set the standard height for the cylinder

    const geometry = new THREE.CylinderGeometry(standardRadius, standardRadius, standardHeight, 32);

    // Create a material for the cylinder with a light blue color and increased brightness
    const cylinderMaterial = new THREE.MeshLambertMaterial({ color: 0x00bfff, emissive: 0xffffff, emissiveIntensity: 0.2 });

    const cylinder = new THREE.Mesh(geometry, cylinderMaterial);

    const ambientLight = new THREE.AmbientLight(0x404040); // Ambient light
    const directionalLight = new THREE.DirectionalLight(0x00ff00, 0.5); // Directional light (change color here)
    directionalLight.position.set(2, 2, 5);

    scene.add(cylinder);
    scene.add(ambientLight);
    scene.add(directionalLight);

    camera.position.set(0, 0, standardHeight * 2.15); // Set camera position
    camera.lookAt(0, 0, 0); // Set camera look at
    // Set the current object to the cylinder
     currentObject = cylinder;
}


// Function to create a rectangle in Three.js
function createRectangle({ length, width, depth }) {
    scene.remove.apply(scene, scene.children);

    if (isNaN(length) || isNaN(width) || isNaN(depth) || length <= 0 || width <= 0 || depth <= 0) {
        console.error('Invalid dimensions for 3D model. Please check the dimensions.');
        return;
    }

    const geometry = new THREE.BoxGeometry(length, width, depth); // Use all three dimensions

    const rectangleMaterials = createDimensionalMaterial(`${length} X ${width} X ${depth} cm`);

    const rectangle = new THREE.Mesh(geometry, rectangleMaterials);

    // Create an EdgesGeometry to highlight only the rectangle's edges
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 }); // Line color for the edges

    const edgeMesh = new THREE.LineSegments(edges, lineMaterial);

    const group = new THREE.Group();
    group.add(rectangle);
    group.add(edgeMesh);

    const ambientLight = new THREE.AmbientLight(0x404040); // Ambient light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1); // Directional light
    directionalLight.position.set(2, 2, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth * 2, window.innerHeight * 2);

    scene.add(group);
    scene.add(ambientLight);
    scene.add(directionalLight);

    camera.position.set(length * 1.5, width * 1.5, depth * 1.5); // Adjust camera position based on all dimensions
    camera.lookAt(length / 2, width / 2, depth / 2); // Adjust camera lookAt position

    function createDimensionalMaterial(dimension) {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.width = 256;
        canvas.height = 256;
        context.fillStyle = "white";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.font = "30px Arial";
        context.fillStyle = "black";
        context.fillText(dimension, 20, 128);

        const texture = new THREE.CanvasTexture(canvas);
        return new THREE.MeshLambertMaterial({ map: texture, color: 0x00ff00 });
    }

    currentObject = group;
}


