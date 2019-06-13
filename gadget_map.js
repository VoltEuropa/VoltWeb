/*jslint maxlen: 80, indent: 2 */
/*global window, rJS, RSVP, L */
(function (window, rJS, RSVP, L) {
  "use strict";

  /////////////////////////////
  // parameters
  /////////////////////////////
  //var INTERSECTION_OBSERVER = window.IntersectionObserver;
  var PINS = "pins";
  var DICT = {};
  var ICON_CONFIG = {
    "iconUrl": "img/s-marker-icon.png",
    "iconSize": [15,25],
    "iconAnchor": [7,23],
    "popupAnchor": [1,-15]
  };
  var MAP_URL = 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}{r}.png';
  var MAP_CONFIG = {
    "attribution": '<a href="https://wikimediafoundation.org/wiki/Maps_Terms_of_Use">Wikimedia</a>',
    "minZoom": 1,
    "maxZoom": 18
  };
  var MARKERS = [];
  var FALLBACK_PATH = "https://raw.githubusercontent.com/VoltEuropa/VoltWeb/master/map/markers.json";

  /////////////////////////////
  // methods
  /////////////////////////////
  function getFallbackDict () {
    return {"data": {
      "rows": [{"id": FALLBACK_PATH, "value": DICT}], "total_rows": 1}
    };
  }
  
  function getConfigDict() {
    return {
      "type": "github_storage",
      "repo": "VoltWeb",
      "path": "map",
      "__debug": "https://softinst103163.host.vifib.net/site/map/debug.json"
    };
  }

  function getElem(my_element, my_selector) {
    return my_element.querySelector(my_selector);
  }

  function mergeDict(my_return_dict, my_new_dict) {
    return Object.keys(my_new_dict).reduce(function (pass_dict, key) {
      pass_dict[key] = my_new_dict[key];
      return pass_dict;
    }, my_return_dict);
  }

  rJS(window)

    /////////////////////////////
    // state
    /////////////////////////////
    .setState({
      "country": null,
      "country_dict": null
    })

    /////////////////////////////
    // ready
    /////////////////////////////
    .ready(function (gadget) {
      var el = gadget.element;
      gadget.property_dict = {
        "map_container": getElem(el, ".volt-map")
      };
      return gadget.declareGadget("gadget_jio.html", {"scope": PINS});
    })

    /////////////////////////////
    // published methods
    /////////////////////////////

    /////////////////////////////
    // acquired methods
    /////////////////////////////
    .declareAcquiredMethod("updateSocialMediaTab", "updateSocialMediaTab")

    /////////////////////////////
    // declared methods
    /////////////////////////////

    // ---------------------- JIO bridge ---------------------------------------
    // this is the JIO storage connectiong to the backend for content, in this
    // case we fetch everything from Github, but it might be plucked to any
    // other backend, implementing the same methods below

    // in this case this could fetch data from volt.team if they were accurate
    .declareMethod("route", function (my_scope, my_call, my_p1, my_p2, my_p3) {
      var gadget = this;
      return gadget.getDeclaredGadget(my_scope)
      .push(function (my_gadget) {
        return my_gadget[my_call](my_p1, my_p2, my_p3);
      });
    })

    .declareMethod("pins_create", function (my_option_dict) {
      return this.route(PINS, "createJIO", my_option_dict);
    })
    .declareMethod("pins_get", function (my_id) {
      return this.route(PINS, "get", my_id);
    })
    .declareMethod("pins_allDocs", function () {
      return this.route(PINS, "allDocs");
    })

    // -------------------.--- Render ------------------------------------------
    .declareMethod("render", function (my_option_dict) {
      var gadget = this;
      var dict = gadget.property_dict;
      window.componentHandler.upgradeDom();

      mergeDict(dict, my_option_dict || {});
      if (dict.map) {
        return;
      }

      return new RSVP.Queue()
        .push(function () {
          return RSVP.all([
            gadget.pins_create(getConfigDict()),
            gadget.stateChange({"country": dict.id})
          ]);
        })
        .push(function () {
          return gadget.pins_allDocs();
        })
        .push(undefined, function (err) {
          throw err;
          return getFallbackDict();
        })
        .push(function (response) {
          return gadget.pins_get(response.data.rows[0].id);
        })
        .push(function (data) {
          dict.marker_dict = data;
          return gadget.updateSocialMediaTab(data[gadget.state.country]);
        })
        .push(function () {
          return gadget.initialiseMap();
        });
    })

    .declareMethod("stateChange", function (delta) {
      var gadget = this;
      if (delta.hasOwnProperty("country")) {
        gadget.state.country = delta.country;
      }
      if (delta.hasOwnProperty("country_dict")) {
        gadget.state.country_dict = delta.country_dict;
      }
      return;
    })

    .declareMethod("initialiseMap", function (my_id) {
      var gadget = this;
      var dict = gadget.property_dict;
      var id;

      if (my_id === gadget.state.country) {
        return;
      }
      if (!dict.map) {
        dict.map = L.map("volt-map", {"zoomControl": false});
        L.control.zoom({"position": "bottomright"}).addTo(dict.map);
      }
      id = my_id || gadget.state.country;
      return gadget.stateChange({
        "country": id,
        "country_dict": dict.marker_dict[id]
      })
      .push(function () {
        return gadget.updateSocialMediaTab(gadget.state.country_dict);
      });
    })

    .declareMethod("redrawMap", function () {
      this.property_dict.map.invalidateSize();
    })

    .declareMethod("renderMap", function (my_country_code) {
      var gadget = this;
      var dict = gadget.property_dict;
      var queue = new RSVP.Queue();

      if (my_country_code) {
        queue.push(function () {
          return gadget.initialiseMap(my_country_code);
        });
      }

      // wikimedia maps
      return queue.push(function () {
        var data = gadget.state.country_dict;
        if (dict.markerLayer) {
          dict.map.removeLayer(dict.markerLayer);
        }
        dict.map.setView(data.position, 5);
        dict.icon = L.icon(ICON_CONFIG);
        dict.map.scrollWheelZoom.disable();
        dict.tileLayer = L.tileLayer(MAP_URL, MAP_CONFIG).addTo(dict.map);
        dict.markerLayer = L.layerGroup(data.city_list.map(function (city) {
          var header = "<strong>" + dict.name_dict[city.i18n] + "</strong><br/>";
          return L.marker(city.position, {"icon": dict.icon}).bindPopup(header);
        })).addTo(dict.map);

        // pass back marker dict to update/init select element
        return dict.marker_dict;
      });
    })
    
    /////////////////////////////
    // declared service
    /////////////////////////////

    /////////////////////////////
    // event bindings
    /////////////////////////////
    .onEvent("click", function (event) {
      var gadget = this;
      if (event.target.classList.contains("volt-map")) {
        gadget.property_dict.map.scrollWheelZoom.enable();
      }
    })

    .onEvent("mouseout", function (event) {
      var gadget = this;
      if (event.target.classList.contains("volt-map")) {
        gadget.property_dict.map.scrollWheelZoom.disable();
      }
    });

}(window, rJS, RSVP, L));
