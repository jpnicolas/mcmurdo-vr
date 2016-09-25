THREE.PointOfInterest = function(opts) {
    this.point = opts.point;
    this.text = opts.text;
    this.id = opts.id;

    this.found = false;
    this.labelPopupDistance = 150;
    this.lineEndpoint = this.getLineEndpoint();
    this.line = this.addLine();
    this.textLabel = this.addTextLabel();
    this.labelBackground = this.addLabelBackground();
};

THREE.PointOfInterest.prototype = {
    constructor: THREE.PointOfInterest,

    addLine: function(){
        var lineMaterial = new THREE.LineBasicMaterial({color: 0xfe5a1d});
        var lineGeometry = new THREE.Geometry();
        var p1 = new THREE.Vector3(this.point.x, this.point.y, this.point.z);
        var p2 = this.lineEndpoint;

        lineGeometry.vertices.push(p1, p2);

        var line = new THREE.Line(lineGeometry, lineMaterial);

        scene.add(line);
        return line;
    },
    addTextLabel: function() {
        var textCoords = this.lineEndpoint;
        var textLabelGeometry = new THREE.Geometry();
        var textLabel = new THREE.Mesh();
        var textMaterial = new THREE.MeshBasicMaterial({color: 0xfe5a1d});

        for (var i = 0; i < this.text.length; i += 1) {
            var textGeom = new THREE.TextGeometry(this.text[i], {
                size: 2.0,
                height: 0,
                weight: "normal",
                style: "normal"
            });

            textGeom.computeBoundingBox();
            textGeom.computeVertexNormals();

            var centerOffset = -0.5 * ( textGeom.boundingBox.max.x - textGeom.boundingBox.min.x );

            var text = new THREE.Mesh(textGeom, textMaterial);
            text.position.x = centerOffset;
            text.position.y = i * -3;
            text.updateMatrix();

            textLabelGeometry.merge(text.geometry, text.matrix, 0);
        }

        var textHeightOffset = this.text.length * 2.25;

        textLabel = new THREE.Mesh(textLabelGeometry, textMaterial);
        textLabel.position.set(textCoords.x, textCoords.y, textCoords.z + textHeightOffset);

        textLabel.updateMatrix();

        scene.add(textLabel);
        return textLabel;
    },
    addLabelBackground: function() {
        var textCoords = this.lineEndpoint;
        var textHeightOffset = this.text.length * 2.25;
        var labelOffset, boundingPlaneGeometry;

        var boundingBox = new THREE.Box3();
        boundingBox.setFromObject(this.textLabel);

        this.textLabel.geometry.computeBoundingBox();

        if (this.text.length === 1) {
            labelOffset = 1;
            boundingPlaneGeometry = new THREE.PlaneGeometry(
                (boundingBox.max.x + 1.5) - (boundingBox.min.x - 1.5),
                boundingBox.max.y - (boundingBox.min.y - textHeightOffset)
            );
        } else {
            labelOffset = -this.text.length + 1;
            boundingPlaneGeometry = new THREE.PlaneGeometry(
                (boundingBox.max.x + 1.5) - (boundingBox.min.x - 1.5),
                boundingBox.max.y - (boundingBox.min.y - textHeightOffset/2)
            );
        }

        var boundingPlaneMaterial = new THREE.MeshBasicMaterial({
            color: 0x333333, transparent: true, opacity:0.0, side: THREE.DoubleSide
        });
        var boundingPlane = new THREE.Mesh(boundingPlaneGeometry, boundingPlaneMaterial);

        // I don't know why we need to do this, but otherwise the position of the background box is offset
        boundingPlane.position.addVectors(
            this.textLabel.position,
            new THREE.Vector3(0,0,labelOffset)
        );

        boundingPlane.originalPosition = boundingPlane.position.clone();

        scene.add(boundingPlane);
        return boundingPlane;
    },
    getLineEndpoint: function() {
        return new THREE.Vector3(this.point.x + 3, this.point.y, this.point.z + 20);
    },
    getDistanceFromCamera: function(camera) {
        if (camera.position.distanceTo(this.lineEndpoint) < this.labelPopupDistance) {
            if (this.found === false) {
                this.found = true;
            }
            this.show();
        } else {
            this.hide();
        }
    },
    getIsVisible: function() {
        return this.line.visible;
    },
    hide: function() {
        this.line.visible = false;
        this.textLabel.visible = false;
        this.labelBackground.visible = false;
    },
    show: function() {
        this.line.visible = true;
        this.textLabel.visible = true;
        this.labelBackground.visible = true;

        // Rotate text to face camera
        this.textLabel.quaternion.copy(camera.quaternion);
        this.labelBackground.quaternion.copy(camera.quaternion);

        var pos = this.labelBackground.originalPosition.clone();
        var direction = this.labelBackground.originalPosition.clone().sub( camera.position ).normalize();
        pos.add(direction.clone().multiplyScalar(1));
        this.labelBackground.position.copy(pos);
    },
};