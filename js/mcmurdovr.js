var Detector = {
    // Detect if webgl is enabled
    webgl: (function() {
        try {
            var canvas = document.createElement('canvas');
            return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
        } catch (e) {
            return false;
        }
    })(),
    setWebVR: (function() {
        navigator.getVRDevices().then(function(devices) {
            for (var i = 0; i < devices.length; i++) {
                if (devices[i] instanceof HMDVRDevice) {
                    Detector.webVR = true;
                }
            }
        });
    })(),
    getWebGLMessage: function() {
        var errorMsg = document.createElement("div");
        errorMsg.id = "no-webgl";
        errorMsg.className = "error-box";
        errorMsg.innerHTML = "<p>Your browser does not appear to support WebGL. This interactive requires WebGL and a modern browser.</p><p><a target='_blank' href='http://superuser.com/questions/836832/how-can-i-enable-webgl-in-my-browser'>Learn how to enable WebGL in your browser</a></p>";
        document.body.appendChild(errorMsg);
    },
    is_iOS8: /iPhone OS 8/.test(navigator.userAgent),
    is_mobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
};

// vars related to window size properties
// Height currently accommodates for header and footer
var WINDOW_WIDTH = window.innerWidth,
    WINDOW_HEIGHT = window.innerHeight,
    WORLD_WIDTH = 2000,
    WORLD_HEIGHT = 2000,
    MAX_ELEVATION = 200,
    TOUR_MODE = false,
    EXPLORE_MODE = false,
    IDLE_MODE = true,
    AUTO_MOVE_FORWARD = false,
    IS_PLAYING, INTRO;

var htmlContainer = document.getElementById("container");
var container = document.getElementById("webgl");
var infoBox = document.getElementById("info-box");
var shareButtonsbox = document.getElementById("desktop-sharebuttons-box");
var loadingBox = document.getElementById('loading-box');
var loadingBoxText = document.getElementById('loading-box-text');
var clock = new THREE.Clock();
var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(75, WINDOW_WIDTH / WINDOW_HEIGHT, 1, 5000);
var raycaster = new THREE.Raycaster();
var autoMovementSpeed = -0.2;
var icesheetSurface;

if (!Detector.webgl) {
    Detector.getWebGLMessage();
    loadingBox.classList.add("hidden");
}

camera.position.set(0, -199, 75);
camera.up = new THREE.Vector3(0, 0, 1);

if (!Detector.is_mobile) {
    camera.lookAt(scene.position);
} else {
    camera.lookAt(new THREE.Vector3(0, 0, 75));
}

camera.originalQuaternion = new THREE.Quaternion();
camera.originalQuaternion.copy(camera.quaternion);

var renderer = new THREE.WebGLRenderer({
    antialias: true
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x000);
renderer.setSize(WINDOW_WIDTH, WINDOW_HEIGHT);
container.appendChild(renderer.domElement);

// Apply VR stereo rendering to renderer
var effect = new THREE.VREffect(renderer);
effect.setSize(WINDOW_WIDTH, WINDOW_HEIGHT);

// Create a VR manager helper to enter and exit VR mode
// add id to the button and hide it
var manager = new WebVRManager(renderer, effect, {
    hideButton: false
});
manager.button.button.id = 'vr-button';
manager.button.setVisibility(false);

// Create and load the binary terrain data
// The TerrainLoader reads in the array of binary data and adjusts the z of each plane vertex
// to correspond with the elevation data in the ENVI file.
var terrainLoader = new THREE.TerrainLoader(),
    terrainURL;

if (Detector.is_mobile) {
    terrainURL = './data/ramp_wgs84_200m_mcmurdo_250x250.bin';
} else {
    terrainURL = './data/ramp_wgs84_200m_mcmurdo_500x500.bin';
}

loadingBoxText.innerHTML = "Loading terrain data...";

// Let's disable the progress bar for now
var loadingManager = new THREE.LoadingManager();
loadingManager.onProgress = function(item, loaded, total) {
    // var progressBar = document.getElementById("bar");
    // progressBar.style.width = (loaded / total) * 100 + "%";
};

terrainLoader.load(terrainURL, function(data) {
    var textureLoader = new THREE.TextureLoader(loadingManager),
        geometry, textureUrl;

    if (Detector.is_mobile) {
        geometry = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_HEIGHT, 249, 249);
        textureUrl = "./img/landsat_mcmurdo_1000x1000px.jpg";
    } else {
        geometry = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_HEIGHT, 499, 499);
        textureUrl = "./img/landsat_mcmurdo_4096x4096px.jpg";
    }

    for (var i = 0, l = geometry.vertices.length; i < l; i++) {
        geometry.vertices[i].z = data[i] / 65535 * 100;
    }

    loadingBoxText.innerHTML = "Loading surface textures...";

    // Image mesh that we map onto the plane
    textureLoader.load(textureUrl, function(texture) {
        var material = new THREE.MeshLambertMaterial({
            map: texture
        });

        icesheetSurface = new THREE.Mesh(geometry, material);
        scene.add(icesheetSurface);

        icesheetSurface.material.needsUpdate = true;

        // Remove loading box and show the intro
        loadingBox.classList.add("fadeout");

        setTimeout(function () {
            loadingBox.classList.add("hidden");
            introBox.classList.remove("hidden");
            // creditsButton.classList.remove("hidden");
        }, 1500);

        if (Detector.webVR) {
            var webVRTourButton = document.getElementById("vr-desktop");
            webVRTourButton.classList.remove("hidden");
            webVRTourButton.addEventListener('click', readyVRTour);
        }

        // Switch which renderer we default to, based on the device we're on
        if (Detector.is_mobile /* || Detector.webVR */) {
            mobileRender();
            onWindowResize();
        } else {
            render();
        }

    });

});

// [Collision detection - Part I goes here]

// Lights!
var dirLight = new THREE.DirectionalLight(0xffffff, 0.75);
dirLight.position.set(-1, 1, 1).normalize();

var ambiLight = new THREE.AmbientLight(0x999999);

scene.add(ambiLight);
scene.add(dirLight);

var controls;
// specifically for Oculus
var controlsVR;
var vrCamera = new THREE.Object3D();
// vrCamera.lookAt(scene.position);
// vrCamera.originalQuaternion = new THREE.Quaternion();
// vrCamera.originalQuaternion.copy(camera.quaternion);
// vrCamera.up = new THREE.Vector3(0,0,1);

// VR stuff applied for touch devices
// otherwise, FlyControls are applied
if (Detector.is_mobile) {
    // Apply VR headset positional data to camera
    controls = new THREE.VRControls(camera);

    // add a targeting crosshair
    var crosshair = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.3, 32),
        new THREE.MeshBasicMaterial({
            color: 0xffffff,
            opacity: 0.5,
            transparent: true,
            visible: false
        })
    );
    crosshair.position.copy(camera.position);
    crosshair.translateZ(-10);
    scene.add(crosshair);
} else {
    controlsVR = new THREE.VRControls(vrCamera);
    controls = new THREE.FlyControls(camera);
    controls.autoForward = false;
    controls.domElement = container;
    controls.dragToLook = true;
    controls.movementSpeed = 20;
    controls.rollSpeed = Math.PI / 12;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / (window.innerHeight);
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
    effect.setSize(window.innerWidth, window.innerHeight);
}

var debouncedResize = debounce(100, onWindowResize);

window.addEventListener('resize', onWindowResize);

var interactionRaycaster = new THREE.Raycaster(),
    mouse = new THREE.Vector2(),
    INTERSECTED;

// Used just to find the world coordinates of points of interest
function onDocumentMouseDown(event) {
    event.preventDefault();

    mouse.x = (event.clientX / renderer.domElement.width) * 2 - 1;
    mouse.y = -((event.clientY) / renderer.domElement.height) * 2 + 1;

    interactionRaycaster.setFromCamera(mouse, camera);

    if (INTERSECTED && !IS_PLAYING) {
        playPointOfInterest(INTERSECTED);
    } else if (IS_PLAYING) {
        pausePointOfInterest(IS_PLAYING);
    }
}

// Used to track mouse hovers over elements in the scene
function onDocumentMouseMove(event) {
    event.preventDefault();
    mouse.x = (event.clientX / renderer.domElement.width) * 2 - 1;
    mouse.y = -((event.clientY) / renderer.domElement.height) * 2 + 1;
}

function debounce(delay, callback) {
    var timeout = null;
    return function() {
        // if a timeout has been registered before then
        // cancel it so that we can setup a fresh timeout
        if (timeout) {
            clearTimeout(timeout);
        }
        var args = arguments;

        timeout = setTimeout(function() {
            callback.apply(null, args);
            timeout = null;
        }, delay);
    };
}

window.onmousemove = debounce(50, onDocumentMouseMove);

// Load labels for points of interest
// Create an array of the planes backing the labels, for efficiency later
var pointsOfInterest = [];
var textLabels = [];
$.getJSON("./data/pointsofinterest.json", function(poiList) {
    for (var i = 0, j = poiList.length; i < j; i += 1) {
        pointsOfInterest.push(new THREE.PointOfInterest(poiList[i]));
        textLabels.push(pointsOfInterest[i].labelBackground);
    }
});

// Points of interest info box
var poiBox = document.getElementById("poi-counter");
var foundPoints = 0;
poiBox.innerHTML = "";

// [Collision detection - Part II goes here]

var tour = {
    init: function() {
        this.curIndex = 0;
        this.needUserInput = false;
        this.speed = 0;
        this.standard = 0.8;
        this.slow = this.standard / 3.0;
        this.fast = this.standard * 1.5;
        this.rotationSpeed = 0.015;
        this.setSpline();
        this.buttonsHolder = document.getElementById("next-point-box");
        this.nextPointButton = document.getElementById("next");
        this.cancelTourButton = document.getElementById("cancel");
        this.endTourBox = document.getElementById("end-tour");
        this.keepExploringButton = document.getElementById("keep-exploring");
        this.nextPointButton.addEventListener('click', this.continueTour.bind(this));
        this.cancelTourButton.addEventListener('click', this.endTour.bind(this));
        pointsOfInterest[this.curIndex].labelBackground.material.opacity = 0.0;
        // TODO: Move this to readyVRTour and move readyVRTour to a method of this object
        if (manager.isVRMode()) {
            this.nextPointText = this.createNextPointText();
            container.addEventListener('click', this.continueVRTourHandler.bind(this));
        }
        console.log("inside init():", this.curIndex);
    },
    animate: function() {
        this.t += this.speed;

        var point = this.ease(this.t / this.splineDistance);
        var pos = this.spline.getPoint(point);
        var distanceToDestination = camera.position.distanceTo(this.spline.points[this.segments - 1]);
        // console.log(distanceToDestination);

        // Slowly rotate the camera quaternion to point to the object, if not idling
        if (!Detector.is_mobile && !IDLE_MODE) {
            camera.quaternion.slerp(this.splineQuaternion, this.rotationSpeed);
        }

        // Continue on the path if more than 50 "units" to destination
        // or stop and play the audio before showing the continue tour options
        if (distanceToDestination > 0.1) {
            if (!Detector.is_mobile) {
                // reset idle mode
                if (!Detector.is_mobile && IDLE_MODE) {
                    IDLE_MODE = false;
                }
            }
            camera.position.copy(pos);

            if (!this.needUserInput) {
                if (distanceToDestination < 4) {
                    if (this.curIndex < pointsOfInterest.length - 1) {
                        this.nextDestination();
                    } else if (this.curIndex === pointsOfInterest.length - 1) {
                        this.nextDestination(true);
                    }
                }
            }
        } else {
            if (!Detector.is_mobile && !IDLE_MODE) {
                // calculate the difference between the camera quaternion and the direction it should be looking
                var dif = new THREE.Quaternion();
                dif.multiplyQuaternions(camera.quaternion, this.splineQuaternionInverse);

                // Reset the reference rotation angle on the camera
                if (dif.x < 0.001 && dif.y < 0.001 && dif.z < 0.001) {
                    camera.originalQuaternion.copy(camera.quaternion);
                    IDLE_MODE = true;
                    angle = 0;
                }
            }
            this.t = 0;
        }

        for (var i = 0, j = pointsOfInterest.length; i < j; i += 1) {
            pointsOfInterest[i].getDistanceFromCamera(camera);
        }

        // whether we use the VR or standard renderer
        if (manager.isVRMode()) {
            // update the nextPointText
            if (this.nextPointText && this.nextPointText.material.visible === true) {
                this.nextPointText.position.set(camera.position.x, camera.position.y, camera.position.z);
                this.nextPointText.translateX(this.nextPointText.centerOffset);
                this.nextPointText.translateY(-2);
                this.nextPointText.translateZ(-10);
                this.nextPointText.quaternion.copy(camera.quaternion);
            }

            if (this.endTourText && this.endTourText.material.visible === true) {
                this.endTourText.position.set(camera.position.x, camera.position.y, camera.position.z);
                this.endTourText.translateY(-2);
                this.endTourText.translateZ(-10);
                this.endTourText.quaternion.copy(camera.quaternion);
            }
        }
    },
    ease: function(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    },
    nextDestination: function(end) {

        console.log("inside nextDestination():", this.curIndex);

        // VR Tour, still points to visit
        if(manager.isVRMode() && !end) {
            console.log("inside nextDestination(1)");
            this.showNextPointText();
        // Regular tour, still points to visit
        } else if (!end) {
            console.log("inside nextDestination(2)");
            this.showNextPointBox();
        // VR Tour End
        } else if (manager.isVRMode()) {
            console.log("inside nextDestination(3)");
            this.showEndVRTourBox();
        // Regular tour end
        } else {
            console.log("inside nextDestination(4)");
            this.showEndTourBox();
        }
        this.curIndex = this.curIndex + 1;
        this.needUserInput = true;
    },
    // This function is based on, and replaces, playIntroAudio() in the original code
    setUpTour: function() {
        AUTO_MOVE_FORWARD = false;
        container.removeEventListener('click', tour.setUpTour);
        tour.init();
        INTRO = null;

        shareButtonsbox.classList.remove("hidden");
        introButton.classList.add("hidden");
        introBox.classList.add("hidden");
        infoBox.classList.add("hidden");
        removeTourBtn();

        if (crosshair) {
            crosshair.material.visible = false;
        }

        if (!manager.isVRMode) {
            beginTour();
        } else {
            beginVRTour();
        }
    },
    continueTour: function() {
        console.log("inside continueTour()")
        pointsOfInterest[this.curIndex].labelBackground.material.opacity = 0.0;
        pointsOfInterest[this.curIndex - 1].labelBackground.material.opacity = 0.0;

        this.needUserInput = false;
        this.setSpline();
        if (manager.isVRMode()) {
            this.hideNextPointText();
        } else {
            this.hideNextButtonsBox();
        }
    },
    continueVRTourHandler: function() {
        // Either skip the audio and go to the next point
        // Or just go to the next point
        if (IS_PLAYING) {
            // Pause audio and make sure the next point text is hidden
            pausePointOfInterest(IS_PLAYING);

            // Show the ending box, when appropriate
            if (this.curIndex !== pointsOfInterest.length) {
                this.continueTour();
            } else {
                this.showEndVRTourBox();
            }

        } else if (!IS_PLAYING && this.nextPointText && this.nextPointText.material.visible === true) {
            this.continueTour();
        }
    },
    createNextPointText: function() {
        var textMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            visible: false
        });
        var textGeom = new THREE.TextGeometry("Tap to continue", {
            size: 0.5,
            height: 0,
            weight: "normal",
            style: "normal"
        });
        textGeom.computeBoundingBox();
        var text = new THREE.Mesh(textGeom, textMaterial);
        text.centerOffset = -0.5 * (textGeom.boundingBox.max.x - textGeom.boundingBox.min.x);
        text.position.x += text.centerOffset;
        text.updateMatrix();

        scene.add(text);
        return text;
    },
    showNextPointText: function() {
        console.log("inside showNextPointText()")
        this.nextPointText.material.visible = true;
    },
    hideNextPointText: function() {
        console.log("inside hideNextPointText()")
        this.nextPointText.material.visible = false;
    },
    endTourAnimation: function() {
        var m1 = new THREE.Matrix4();
        var q = new THREE.Quaternion();
        var endPos = new THREE.Vector3();

        console.log(camera.position, scene.position);

        endPos.copy(camera.position);
        endPos.setZ(endPos.z + 50);
        q.copy(camera.quaternion);
        m1.lookAt(camera.position, scene.position, camera.up);

        var curve = new THREE.LineCurve(camera.position, endPos);

        this.speed = this.slow;
        this.spline = new THREE.Spline(curve.getPoints(40));
        this.segments = this.spline.points.length;
        this.splineDistance = camera.position.distanceTo(endPos);
        this.splineQuaternion = q.setFromRotationMatrix(m1);
        this.splineQuaternionInverse = new THREE.Quaternion().copy(this.splineQuaternion).inverse();
        this.rotationSpeed = 0.007;
        this.t = 0;

    },
    showEndTourBox: function() {
        // For now, let's keep things simple and not run endTourAnimation()
        // this.endTourAnimation();
        this.endTourBox.classList.remove("hidden");
        this.keepExploringButton.addEventListener("click", this.endTour.bind(this));
        this.hideNextButtonsBox();
    },
    showEndVRTourBox: function() {
        this.endTourAnimation();
        var text = ["Now it's your turn", "Tap to keep exploring"];
        var textGeometry = new THREE.Geometry();
        var textMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff
        });
        this.endTourText = new THREE.Mesh();

        for (var i = 0; i < text.length; i += 1) {
            var textLineGeom = new THREE.TextGeometry(text[i], {
                size: 0.5,
                height: 0,
                weight: "normal",
                style: "normal"
            });

            textLineGeom.computeBoundingBox();
            textLineGeom.computeVertexNormals();

            var centerOffset = -0.5 * (textLineGeom.boundingBox.max.x - textLineGeom.boundingBox.min.x);

            var textLine = new THREE.Mesh(textLineGeom, textMaterial);
            textLine.position.x = centerOffset;
            textLine.position.y = i * -1;
            textLine.updateMatrix();

            textGeometry.merge(textLine.geometry, textLine.matrix, 0);
        }
        this.endTourText = new THREE.Mesh(textGeometry, textMaterial);
        container.addEventListener('touchend', this.endVRTourHandler.bind(this));

        scene.add(this.endTourText);
    },
    endVRTourHandler: function() {
        if (this.endTourText && this.endTourText.material.visible === true) {
            this.endVRTour();
        }
    },
    endVRTour: function() {
        scene.remove(this.nextPointText);
        scene.remove(this.endTourText);

        this.nextPointText.material.dispose();
        this.nextPointText.geometry.dispose();
        this.endTourText.material.dispose();
        this.endTourText.geometry.dispose();

        pointsOfInterest[this.curIndex - 1].labelBackground.material.opacity = 0.0;

        this.nextPointText = null;
        this.endTourText = null;
        this.curIndex = null;

        TOUR_MODE = false;
        IS_PLAYING = null;
        AUTO_MOVE_FORWARD = true;

        explore();
    },
    endTour: function() {
        this.endTourBox.classList.add("hidden");
        this.hideNextButtonsBox();
        pointsOfInterest[this.curIndex - 1].labelBackground.material.opacity = 0.0;

        this.curIndex = null;
        IS_PLAYING = null;

        if (Detector.is_mobile) {
            showInstructions("mobile");
        } else if (manager.isVRMode()) {
            showInstructions("vr");
        } else {
            showInstructions("desktop");
        }
    },
    hideNextButtonsBox: function() {
        console.log("inside hideNextButtonsBox()")
        this.buttonsHolder.classList.add("hidden");
    },
    // Get the midway point between two vectors
    getBezierMidpoint: function(v1, v3) {
        var d = v1.distanceTo(v3);
        var v2 = new THREE.Vector3();
        v2.x = (v1.x + v3.x) / 2;
        v2.y = (v1.y + v3.y) / 2;
        v2.z = (v1.z + v3.z) / 2;

        // Add a value to z, determined by distance, to give a nice curve shape
        v2.z = v2.z + d / 4;
        return v2;
    },
    // Create a Bezier curve between two points
    // Three.js requires three points so we generate a third
    // which is actually v2 in the function since it's in the middle
    makeBezierCurve: function(v1, v3) {
        var v2 = this.getBezierMidpoint(v1, v3);
        var curve = new THREE.QuadraticBezierCurve3(v1, v2, v3);
        var points = curve.getPoints(50);

        // walk back and trim the spline until a specified number of units out from the destination
        for (var i = points.length - 1; i > 0; i--) {
            if (points[i].distanceTo(v3) > 100) {
                break;
            } else {
                points.splice(i, 1);
            }
        }

        return points;
    },
    setSpline: function() {
        console.log("Inside setSpline()");
        // create a rotation matrix for the object so the camera knows where to look
        var m1 = new THREE.Matrix4();
        var q = camera.quaternion.clone();

        m1.lookAt(camera.position, pointsOfInterest[this.curIndex].point, camera.up);
        this.splineCurve = this.makeBezierCurve(camera.position, pointsOfInterest[this.curIndex].point);
        this.spline = new THREE.Spline(this.splineCurve);
        this.segments = this.spline.points.length;
        this.splineDistance = camera.position.distanceTo(pointsOfInterest[this.curIndex].point);
        this.splineQuaternion = q.setFromRotationMatrix(m1);
        this.splineQuaternionInverse = new THREE.Quaternion().copy(this.splineQuaternion).inverse();
        this.t = 0;

        // Set the travel speed based on how far the point is
        if (this.splineDistance < 100) {
            this.speed = this.slow;
        } else if (this.splineDistance > 600) {
            this.speed = this.fast;
        } else {
            this.speed = this.standard;
        }
    },
    showNextPointBox: function() {
        this.buttonsHolder.classList.remove("hidden");
    },
};

var worldsEndBox = document.getElementById("worlds-end-box");

function checkWorldEdges() {
    var atWorldsEnd = false;

    // Set max elevation for the camera
    if (camera.position.z > MAX_ELEVATION) {
        camera.position.z = MAX_ELEVATION;
    }
    // Make sure the camera is not exceeding the x or y bounds of the scene
    if (camera.position.x > WORLD_WIDTH / 2 - 150) {
        camera.position.x = WORLD_WIDTH / 2 - 150;
        worldsEndBox.classList.remove("fadeout");
        atWorldsEnd = true;
    } else if (camera.position.x < -WORLD_WIDTH / 2 + 150) {
        camera.position.x = -WORLD_WIDTH / 2 + 150;
        worldsEndBox.classList.remove("fadeout");
        atWorldsEnd = true;
    }

    if (camera.position.y > WORLD_HEIGHT / 2 - 150) {
        camera.position.y = WORLD_HEIGHT / 2 - 150;
        worldsEndBox.classList.remove("fadeout");
        atWorldsEnd = true;
    } else if (camera.position.y < -WORLD_HEIGHT / 2 + 150) {
        camera.position.y = -WORLD_HEIGHT / 2 + 150;
        worldsEndBox.classList.remove("fadeout");
        atWorldsEnd = true;
    }

    if (!atWorldsEnd && worldsEndBox.className.indexOf("fadeout") === -1) {
        worldsEndBox.classList.add("fadeout");
    }

}

// mouse or crosshair interaction with text labels
function checkHover(vector) {
    interactionRaycaster.setFromCamera(vector, camera);
    var mouseIntersects = interactionRaycaster.intersectObjects(textLabels);

    if (mouseIntersects.length > 0) {
        if (INTERSECTED != mouseIntersects[0].object && mouseIntersects[0].object.visible === true) {
            document.body.style.cursor = "pointer";
            INTERSECTED = mouseIntersects[0].object;
            INTERSECTED.material.opacity = 0.2;
            if (crosshair) {
                crosshair.material.color.setHex(0x59aee6);
                crosshair.material.opacity = 0.9;
            }
        }
    } else {
        if (INTERSECTED) {
            document.body.style.cursor = "default";
            INTERSECTED.material.opacity = 0.0;
            INTERSECTED.startTime = null;
            INTERSECTED.elapsedTime = null;
            INTERSECTED = null;
            if (crosshair) {
                crosshair.material.color.setHex(0xffffff);
                crosshair.material.opacity = 0.5;
            }
        }
    }
}

var poiBoxTimer;

function flashPoiBox() {
    clearTimeout(poiBoxTimer);
    lateTourBtn.classList.add("fadeout");
    poiBox.classList.remove("fadeout");
    poiBoxTimer = setTimeout(function() {
        poiBox.classList.add("fadeout");
        lateTourBtn.classList.remove("fadeout");
    }, 3000);
}

var angle = 0;
var idleAxis = new THREE.Vector3(1, 0, 0);
var waveHeight = 0.05;

function idle() {
    var rotationAngle = (Math.sin(angle) * waveHeight);
    var q = new THREE.Quaternion();

    angle -= 0.0012;
    q.setFromAxisAngle(idleAxis, rotationAngle);
    camera.quaternion.multiplyQuaternions(camera.originalQuaternion, q);
}

// Renderer for non-mobile devices
function render() {
    var delta = clock.getDelta();

    if (Detector.webVR) {
        controlsVR.update();
        camera.quaternion.multiplyQuaternions(camera.originalQuaternion, vrCamera.quaternion);
    }

    if (TOUR_MODE) {
        tour.animate();
    } else {

        // all our interaction and collision detection bits here
        if (EXPLORE_MODE) {
            checkWorldEdges();
        }

        // Let's disable this function for now
        // checkHover(mouse);

        if (EXPLORE_MODE) {
            controls.update(delta);
        }

        var found = 0;
        for (var i = 0, j = pointsOfInterest.length; i < j; i += 1) {
            pointsOfInterest[i].getDistanceFromCamera(camera);

            // Check for found points
            if (pointsOfInterest[i].found === true) {
                found += 1;
            }
        }

        // // Check if we have new found points, and update the box
        if (found !== foundPoints) {
            foundPoints = found;
            poiBox.innerHTML = foundPoints + " of " + pointsOfInterest.length + " points of interest found.";
            // Let's disable this function for now
            // flashPoiBox();
        }
    }

    // Don't idle in VR mode
    if (IDLE_MODE && !manager.isVRMode() && !Detector.webVR) {
        idle();
    }

    if (manager.isVRMode()) {
        effect.render(scene, camera);
    } else {
        manager.render(scene, camera);
    }

    requestAnimationFrame(render);

}

function mobileRender() {
    var delta = clock.getDelta(),
        isCollided;

    controls.update();

    if (TOUR_MODE) {
        tour.animate();
    } else {

        // Let's disable this function for now
        // checkHover({
        //     x: 0,
        //     y: 0
        // });

        // if movement is toggled
        if (EXPLORE_MODE === true && AUTO_MOVE_FORWARD && !isCollided) {
            camera.translateZ(autoMovementSpeed);
        }

        checkWorldEdges();

        crosshair.quaternion.copy(camera.quaternion);
        crosshair.position.copy(camera.position);
        crosshair.translateZ(-10);

        if (INTERSECTED && !IS_PLAYING) {
            if (!INTERSECTED.startTime) {
                INTERSECTED.startTime = clock.oldTime;
                INTERSECTED.elapsedTime = 0;
            } else {
                INTERSECTED.elapsedTime = clock.oldTime - INTERSECTED.startTime;
            }
            if (INTERSECTED.elapsedTime > 1500) {
                playPointOfInterest(INTERSECTED);
                infoBox.innerHTML = "<span>Touch screen to start moving</span>";
                AUTO_MOVE_FORWARD = false;
            }
        }

        var found = 0;
        for (var i = 0, j = pointsOfInterest.length; i < j; i += 1) {
            pointsOfInterest[i].getDistanceFromCamera(camera);

            // Check for found points
            if (pointsOfInterest[i].found === true) {
                found += 1;
            }
        }

        // Check if we have new found points, and update the box
        if (found !== foundPoints) {
            foundPoints = found;
            poiBox.innerHTML = foundPoints + " of " + pointsOfInterest.length + " points of interest found.";
            // Let's disable this function for now
            // flashPoiBox();
        }
    }

    manager.render(scene, camera);

    requestAnimationFrame(mobileRender);
}

// Begin tour in a standard non-VR view
function beginTour() {
    TOUR_MODE = true;
    EXPLORE_MODE = false;
    IDLE_MODE = false;
    INTRO = null;
}

// Switch to VR view, give user a chance to mount in VR device before starting
function readyVRTour() {
    document.getElementById('vr-button').click();
    introBox.classList.add("hidden");
    instructionsBox.classList.add("hidden");
    infoBox.classList.remove("hidden");
    infoBox.innerHTML = "<span>Touch screen to start tour</span>";
    container.addEventListener('click', tour.setUpTour);

    // Hide the VR instructions so they don't come back later
    var instructions = document.getElementById('instructions-vr');
    instructions.classList.add("hidden");
}

// Start moving
function beginVRTour() {
    TOUR_MODE = true;
    IDLE_MODE = false;
    INTRO = null;
    container.removeEventListener('click', beginVRTour);
    infoBox.classList.add("hidden");
}

// Add a button to start a tour if the user's already begun exploring
function addTourBtn() {
    console.log("inside addTourBtn()");
    // lateTourBtn.classList.remove("hidden");
}

function removeTourBtn() {
    console.log("inside removeTourBtn()");
    // lateTourBtn.classList.remove("hidden");
    // if (lateTourBtn) {
    //     htmlContainer.removeChild(lateTourBtn);
    // }
}

// Free explore mode
function explore() {
    TOUR_MODE = false;
    IDLE_MODE = false;
    EXPLORE_MODE = true;
    shareButtonsbox.classList.remove("hidden");
    instructionsBox.classList.add("hidden");
    infoBox.classList.remove("hidden");
    introButton.classList.remove("hidden");

    addTourBtn();
    if (Detector.is_mobile) {
        if (AUTO_MOVE_FORWARD === true) {
            infoBox.innerHTML = "<span>Touch screen to stop moving</span>";
        } else {
            infoBox.innerHTML = "<span>Touch screen to start moving</span>";
        }

        crosshair.material.visible = true;
        container.addEventListener("touchstart", touchToggle);
    }
}

function hideInstructions(device) {
    switch (device) {
        case "desktop":
            instructions = document.getElementById('instructions-desktop');
            break;
        case "mobile":
            instructions = document.getElementById('instructions-mobile');
            break;
        case "vr":
            instructions = document.getElementById('instructions-vr');
            break;
    }
    instructions.classList.add("hidden");
}

function showInstructions(device) {
    var instructions;
    shareButtonsbox.classList.remove("hidden");
    introBox.classList.add("hidden");
    instructionsBox.classList.remove("hidden");
    switch (device) {
        case "desktop":
            TOUR_MODE = false;
            IDLE_MODE = false;
            EXPLORE_MODE = true;
            instructions = document.getElementById('instructions-desktop');
            document.addEventListener('mousedown', onDocumentMouseDown, false);
            break;
        case "mobile":
            TOUR_MODE = false;
            IDLE_MODE = false;
            EXPLORE_MODE = true;
            instructions = document.getElementById('instructions-mobile');
            break;
        case "vr":
            IDLE_MODE = false;
            instructions = document.getElementById('instructions-vr');
    }
    instructions.classList.remove("hidden");
}

// This function is based on, and replaces, skipAudio() in the original code
function pauseTour() {
    // If in tour mode pause and show next point box
    // Unless at the end of the tour show the end tour box
    if (TOUR_MODE) {
        if (tour.curIndex !== pointsOfInterest.length) {
            if (manager.isVRMode()) {
                tour.showNextPointText();
            } else {
                tour.showNextPointBox();
            }
        } else {
            if (manager.isVRMode()) {
                tour.showEndVRTourBox();
            } else {
                tour.showEndTourBox();
            }
        }
    }
}

function closeCreditsBox() {
    var creditsBox = document.getElementById("credits-box");
    var closeCreditsButton = document.getElementById("close-credits-button");
    if (!EXPLORE_MODE && !TOUR_MODE) {
        introBox.classList.remove("hidden");
    }
    creditsBox.classList.add("hidden");
    closeCreditsButton.removeEventListener('click', closeCreditsBox);
    container.removeEventListener('click', closeCreditsBox);
}

function openCreditsBox() {
    var creditsBox = document.getElementById("credits-box");
    var closeCreditsButton = document.getElementById("close-credits-button");
    creditsBox.classList.remove("hidden");
    introBox.classList.add("hidden");

    closeCreditsButton.addEventListener('click', closeCreditsBox);
    container.addEventListener('click', closeCreditsBox);
}

function reopenIntro() {
    console.log("inside reopenIntro()");
    TOUR_MODE = false;
    EXPLORE_MODE = false;
    IDLE_MODE = true;
    introBox.classList.remove("hidden");
    instructionsBox.classList.add("hidden");
    introButton.classList.add("hidden");
    infoBox.classList.add("hidden");
    // lateTourBtn.classList.add("hidden");
}

var introBox = document.getElementById("intro-box");
var instructionsBox = document.getElementById("instructions-box");
var tourButton = document.getElementById("tour");
var exploreButton = document.getElementById("explore");
var standardButton = document.getElementById("standard");
var vrButton = document.getElementById("vr");
var beginDesktopButton = document.getElementById("begin-desktop");
var beginMobileButton = document.getElementById("begin-mobile");
var beginVRButton = document.getElementById("begin-vr");
var oopsNoVRButton = document.getElementById("no-vr");
var creditsButton = document.getElementById("credits");
var introButton = document.getElementById("home");
var lateTourBtn = document.getElementById('tour-btn');

tourButton.addEventListener('click', tour.setUpTour);
exploreButton.addEventListener('click', function() {
    showInstructions("desktop");
});
standardButton.addEventListener('click', function() {
    showInstructions("mobile");
});
vrButton.addEventListener('click', function() {
    showInstructions("vr");
});
beginDesktopButton.addEventListener('click', explore);
beginMobileButton.addEventListener('click', explore);
beginVRButton.addEventListener('click', readyVRTour);
oopsNoVRButton.addEventListener('click', function() {
    hideInstructions("vr");
    showInstructions("mobile");
});
// lateTourBtn.addEventListener('click', tour.setUpTour);
// creditsButton.addEventListener('click', openCreditsBox);
introButton.addEventListener('click', reopenIntro);

// Shift to speed up, escape to skip
if (!Detector.is_mobile) {
    document.addEventListener("keydown", function(e) {
        switch (e.keyCode) {
            // shift
            case 16:
                controls.movementSpeed = 30;
                break;
                // escape
            case 27:
                if (!INTRO) {
                    skipAudio();
                } else {
                    INTRO = false;
                    tour.introAudio.pause();
                    clearTimeout(tour.introTimer);
                    poiBox.classList.add("hidden");

                    if (!manager.isVRMode) {
                        beginTour();
                    } else {
                        beginVRTour();
                    }
                }
                break;

        }
    });
    document.addEventListener("keyup", function(e) {
        switch (e.keyCode) {
            case 16:
                controls.movementSpeed = 20;
                break;
        }
    });

}

// Toggle AUTO_MOVE_FORWARD and pause audio, if it's playing
function touchToggle() {
    // toggle AUTO_MOVE_FORWARD, only in free explore mode
    if (TOUR_MODE === true) {
        if (IS_PLAYING) {
            skipAudio();
        }
    } else if (EXPLORE_MODE === true) {
        AUTO_MOVE_FORWARD = !AUTO_MOVE_FORWARD;
        if (IS_PLAYING) {
            pausePointOfInterest(IS_PLAYING);
        }

        if (AUTO_MOVE_FORWARD === true) {
            infoBox.innerHTML = "<span>Touch screen to stop moving</span>";
        } else {
            infoBox.innerHTML = "<span>Touch screen to start moving</span>";
        }
    }
}