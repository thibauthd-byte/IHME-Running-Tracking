CREATE TABLE prototypes (
    id SERIAL PRIMARY KEY,
    reference VARCHAR(50) NOT NULL,
    pointure NUMERIC(3, 1) NOT NULL,
    testeur_nom VARCHAR(100) DEFAULT NULL,
    km_total NUMERIC(6, 1) DEFAULT 0.0
);

CREATE TABLE sorties (
    id SERIAL PRIMARY KEY,
    prototype_id INT REFERENCES prototypes(id) ON DELETE CASCADE,
    distance_km NUMERIC(5, 1) NOT NULL,
    date_sortie DATE NOT NULL DEFAULT CURRENT_DATE
);

INSERT INTO prototypes (reference, pointure, testeur_nom, km_total) VALUES
('PROTO-PEGASUS-V1', 42.5, 'Lucas', 135.0),
('PROTO-BOOST-X', 44.0, 'Thomas', 45.0),
('PROTO-CARBON-LAB', 41.0, NULL, 0.0);
