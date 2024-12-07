import React, { useState, useRef, useEffect } from "react";
import * as shapefile from "shapefile";
import proj4 from "proj4";
import { Loader } from "@googlemaps/js-api-loader";
import "./index.css";

const defaultCenter = { lat: 21.838, lng: 73.7191 };
const defaultZoom = 8;

function RenderMap() {
  const mapRef = useRef(null);
  const googleMap = useRef(null);
  const infoWindow = useRef(null);
  const [geoData, setGeoData] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState({
    shp: null,
    dbf: null,
    shx: null,
    prj: null,
    cpg: null,
    sbn: null,
    sbx: null,
    xml: null,
  });
  const fileInputRefs = {
    shp: useRef(),
    dbf: useRef(),
    shx: useRef(),
    prj: useRef(),
    cpg: useRef(),
    sbn: useRef(),
    sbx: useRef(),
    xml: useRef(),
  };

  useEffect(() => {
    const loader = new Loader({
      apiKey: "", // Replace with your actual API key
      version: "weekly",
    });

    loader
      .load()
      .then(() => {
        googleMap.current = new window.google.maps.Map(mapRef.current, {
          center: defaultCenter,
          zoom: defaultZoom,
        });
        infoWindow.current = new window.google.maps.InfoWindow();
      })
      .catch((error) => {
        console.error("Error loading Google Maps API:", error);
      });
  }, []);

  useEffect(() => {
    if (geoData && googleMap.current) {
      // Clear existing data layers
      googleMap.current.data.forEach((feature) => {
        googleMap.current.data.remove(feature);
      });
  
      // Add new GeoJSON data
      googleMap.current.data.addGeoJson(geoData);
  
      googleMap.current.data.setStyle({
        fillColor: "#00FFFF",
        fillOpacity: 0.5,
        strokeColor: "#FF1493",
        strokeWeight: 2,
      });
  
      // Fit the map to GeoJSON bounds
      const bounds = new window.google.maps.LatLngBounds();
      googleMap.current.data.forEach((feature) => {
        const geometry = feature.getGeometry();
        if (geometry) {
          geometry.forEachLatLng((latLng) => bounds.extend(latLng));
        }
      });
  
      if (!bounds.isEmpty()) {
        googleMap.current.fitBounds(bounds);
      } else {
        console.warn("No valid GeoJSON bounds to adjust the map.");
      }
  
      // Add click listener to display feature data
      googleMap.current.data.addListener("click", (event) => {
        const feature = event.feature;
        const properties = {};
        feature.forEachProperty((value, key) => {
          properties[key] = value;
        });
  
        const formattedProperties = `
          <table style="border-collapse: collapse; width: 100%;">
            ${Object.entries(properties)
              .map(
                ([key, value]) => `
                  <tr>
                    <td style="border: 1px solid #ccc; padding: 4px;"><strong>${key}</strong></td>
                    <td style="border: 1px solid #ccc; padding: 4px;">${value}</td>
                  </tr>
                `
              )
              .join("")}
          </table>
        `;
  
        const geometry = feature.getGeometry();
        if (geometry) {
          if (geometry.getType() === "Point") {
            const position = geometry.get();
            infoWindow.current.setPosition(position);
          } else {
            const bounds = new window.google.maps.LatLngBounds();
            geometry.forEachLatLng((latLng) => bounds.extend(latLng));
            infoWindow.current.setPosition(bounds.getCenter());
          }
        } else {
          // If there is no geometry, center info window on the map (or any default position)
          const center = googleMap.current.getCenter();
          infoWindow.current.setPosition(center);
        }
  
        // Set the content of the info window with the properties
        infoWindow.current.setContent(formattedProperties);
        infoWindow.current.open(googleMap.current);
      });
    }
  }, [geoData]);
  

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const extension = file.name.split(".").pop().toLowerCase();

    if (
      ["shp", "dbf", "shx", "prj", "cpg", "sbn", "sbx", "xml"].includes(
        extension
      )
    ) {
      setUploadedFiles((prevFiles) => ({
        ...prevFiles,
        [extension]: file,
      }));
      console.log(`${extension} file uploaded:`, file.name);
    } else {
      alert(
        "Invalid file type. Please upload .shp, .dbf, .shx, .prj, .cpg, .sbn, .sbx, or .xml files."
      );
    }
  };

  const resetFiles = () => {
    if (!window.confirm("Are you sure you want to clear all uploaded files?")) {
      return;
    }

    setUploadedFiles({
      shp: null,
      dbf: null,
      shx: null,
      prj: null,
      cpg: null,
      sbn: null,
      sbx: null,
      xml: null,
    });

    setGeoData(null);

    Object.values(fileInputRefs).forEach((ref) => {
      if (ref.current) ref.current.value = null;
    });

    if (googleMap.current) {
      googleMap.current.data.forEach((feature) => {
        googleMap.current.data.remove(feature);
      });
      googleMap.current.setCenter(defaultCenter);
      googleMap.current.setZoom(defaultZoom);
    }

    if (infoWindow.current) {
      infoWindow.current.close();
      infoWindow.current.setContent(null); // Clear the content
    }
  };

  const processShapefile = async () => {
    if (!uploadedFiles.shp || !uploadedFiles.dbf) {
      alert("Please upload both .shp and .dbf files.");
      return;
    }

    try {
      const shpBuffer = await readFileAsArrayBuffer(uploadedFiles.shp);
      const dbfBuffer = await readFileAsArrayBuffer(uploadedFiles.dbf);

      let geojson = await shapefile.read(shpBuffer, dbfBuffer);

      if (uploadedFiles.prj) {
        const prjText = await readFileAsText(uploadedFiles.prj);
        const sourceProjection = proj4(prjText.trim());
        const wgs84Projection = proj4("EPSG:4326");

        geojson.features = geojson.features.map((feature) => {
          const transformCoordinates = (coords) => {
            if (!Array.isArray(coords)) return coords;
            if (typeof coords[0] === "number") {
              return proj4(sourceProjection, wgs84Projection, coords);
            }
            return coords.map(transformCoordinates);
          };

          feature.geometry.coordinates = transformCoordinates(
            feature.geometry.coordinates
          );
          return feature;
        });
      }

      if (geojson.features && geojson.features.length > 0) {
        setGeoData(geojson);
      } else {
        alert("No valid features found in the shapefile.");
      }
    } catch (error) {
      console.error("Error processing shapefile:", error);
      alert("An error occurred while processing the shapefile.");
    }
  };

  const readFileAsArrayBuffer = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });

  const readFileAsText = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });

  return (
    <div className="App" style={{ display: "flex", flexDirection: "row" }}>
      <div
        ref={mapRef}
        className="map-container mt-5"
        style={{ width: "70%", height: "100vh" }}
      ></div>
      <div
        className="file-upload-section mt-5"
        style={{
          width: "30%",
          padding: "20px",
          borderLeft: "1px solid #ccc",
          backgroundColor: "#f9f9f9",
        }}
      >
        <h2>Upload Shapefile</h2>
        {Object.keys(fileInputRefs).map((ext) => (
          <div key={ext}>
            <label>
              Upload .{ext.toUpperCase()}:
              <input
                type="file"
                accept={`.${ext}`}
                onChange={handleFileSelect}
                ref={fileInputRefs[ext]}
              />
            </label>
          </div>
        ))}
        <div style={{ marginTop: "10px" }}>
          <button onClick={processShapefile}>Process Shapefile</button>
          <button onClick={resetFiles} style={{ marginLeft: "10px" }}>
            Clear Files
          </button>
        </div>
      </div>
    </div>
  );
}

export default RenderMap;
