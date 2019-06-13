/*jslint maxlen: 80, indent: 2 */
/*global window, rJS, RSVP */
(function (window, rJS, RSVP) {
  "use strict";

  /////////////////////////////
  // parameters
  /////////////////////////////
  var RESPONSIVE_CLASS = "volt-navbar-list-responsive";
  var ARR = [];
  var CANVAS = "canvas";
  var STR = "";
  var CLICK = "click";
  var ACTION = "data-action";
  var DOT = ".";
  var DOCUMENT = window.document;
  var LINK_DISABLED = "volt-link__disabled";
  var NAME = "name";
  var DIALOG = ".volt-dialog-";
  var DIALOG_POLYFILL = window.dialogPolyfill;
  var LIST = "volt-navbar-list";
  var LINK = "volt-navbar-link";
  var HIDDEN = "volt-hidden";
  var FULLSCREN = "volt-dialog-fullscreen";
  var TEMPLATE_PARSER = /\{([^{}]*)\}/g;
  var KLASS = rJS(window);

  /////////////////////////////
  // methods
  /////////////////////////////
  function getParent(my_element, my_class) {
    if (my_element && my_element.classList.contains(my_class)) {
      return my_element;
    }
    if (my_element.parentElement) {
      return getParent(my_element.parentElement, my_class);
    }
    return null;
  }

  function mergeDict(my_return_dict, my_new_dict) {
    return Object.keys(my_new_dict).reduce(function (pass_dict, key) {
      pass_dict[key] = my_new_dict[key];
      return pass_dict;
    }, my_return_dict);
  }

  function getElem(my_element, my_selector) {
    return my_element.querySelector(my_selector);
  }

  function getTemplate(my_klass, my_id) {
    return my_klass.__template_element.getElementById(my_id).innerHTML;
  }

  function compare( a, b ) {
    if ( a.last_nom < b.last_nom ){
      return -1;
    }
    if ( a.last_nom > b.last_nom ){
      return 1;
    }
    return 0;
  }

  function purgeDom(my_node) {
    while (my_node.firstChild) {
      my_node.removeChild(my_node.firstChild);
    }
  }

  function setDom(my_node, my_string, my_purge) {
    var faux_element = DOCUMENT.createElement(CANVAS);
    if (my_purge) {
      purgeDom(my_node);
    }
    faux_element.innerHTML = my_string;
    ARR.slice.call(faux_element.children).forEach(function (element) {
      my_node.appendChild(element);
    });
  }

  function updateSelect(my_dialog, my_json, my_country, my_dict) {
    var response = "";
    var clean_list = [];
    var key;
    for (key in my_json) {
      if (my_json.hasOwnProperty(key)) {
        clean_list.push({
          "id": key,
          "i18n": my_json[key].i18n,
          "name": my_dict[my_json[key].i18n]
        });
      }
    }
    clean_list.sort(compare).map(function (entry) {
      response += getTemplate(KLASS, "country_option_template").supplant({
        "id": entry.id,
        "country_i18n": entry.i18n,
        "country_name": entry.name
      });
    });
    setDom(getElem(my_dialog, ".volt-dialog__select-wrapper"), getTemplate(
      KLASS, "country_select_template").supplant({
        "content": response
      }), true
    );
  }

  // poor man's templates. thx, http://javascript.crockford.com/remedial.html
  if (!String.prototype.supplant) {
    String.prototype.supplant = function (o) {
      return this.replace(TEMPLATE_PARSER, function (a, b) {
        var r = o[b];
        return typeof r === "string" || typeof r === "number" ? r : a;
      });
    };
  }

  KLASS

    /////////////////////////////
    // ready
    /////////////////////////////
    .ready(function (gadget) {
      var el = gadget.element;
      gadget.property_dict = {
        "navbar_list": el.querySelectorAll(".volt-navbar-list"),
        "menu_button_list": getElem(el, ".volt-navbar-menu"),
        "header": getElem(el,".volt-header"),
        "map_wrapper": getElem(el, ".volt-map__wrapper"),
        "dialog": getElem(el, ".volt-dialog-scope"),
        "dialog_full": getElem(el, ".volt-dialog__action-full"),
        "dialog_exit": getElem(el, ".volt-dialog__action-exit"),
        "scm_container": getElem(el, ".volt-dialog__floater"),
        "select": getElem(el, ".volt-select__country")
      };
      return gadget.declareGadget("gadget_map.html", {
        "scope": "map",
        "element": gadget.property_dict.map_wrapper
      });
    })

    /////////////////////////////
    // acquired methods
    /////////////////////////////
    .declareAcquiredMethod("remoteTranslate", "remoteTranslate")

    /////////////////////////////
    // published methods
    /////////////////////////////
    .allowPublicAcquisition("updateSocialMediaTab", function (my_dict) {
      var gadget = this;
      var dict = gadget.property_dict;
      var country_dict = my_dict[0];
      var link_list = dict.scm_container.querySelectorAll(".volt-link");
      var fb_link = link_list[0];
      var tw_link = link_list[1];
      var web_link = link_list[2];

      if (!!country_dict.facebook_url) {
        fb_link.setAttribute("href", country_dict.facebook_url);
        fb_link.classList.remove(LINK_DISABLED);
      } else {
        fb_link.setAttribute("href", STR);
        fb_link.classList.add(LINK_DISABLED);
      }
      if (!!country_dict.twitter_url) {
        tw_link.setAttribute("href", country_dict.twitter_url);
        tw_link.classList.remove(LINK_DISABLED);
      } else {
        tw_link.setAttribute("href", STR);
        tw_link.classList.add(LINK_DISABLED);
      }
      if (!!country_dict.web_url) {
        web_link.setAttribute("href", country_dict.web_url);
        web_link.classList.remove(LINK_DISABLED);
      } else {
        web_link.setAttribute("href", STR);
        web_link.classList.add(LINK_DISABLED);
      }
    })

    /////////////////////////////
    // declared methods
    /////////////////////////////

    // -------------------------- Dialogs --------------------------------------
    .declareMethod("expandDialog", function (my_event, my_fullscreen) {
      var gadget = this;
      var dict = gadget.property_dict;
      if (my_fullscreen) {
        dict.dialog.classList.add(FULLSCREN);
        dict.dialog_full.classList.add(HIDDEN);
        dict.dialog_exit.classList.remove(HIDDEN);
      } else {
        dict.dialog.classList.remove(FULLSCREN);
        dict.dialog_full.classList.remove(HIDDEN);
        dict.dialog_exit.classList.add(HIDDEN);
      }
      return gadget.getDeclaredGadget("map")
        .push(function (my_declared_gadget) {
          return my_declared_gadget.redrawMap();
        });
    })
    .declareMethod("handleDialog", function (my_event) {
      var gadget = this;
      var dict = gadget.property_dict;
      var dialog = dict.dialog;
      var active_element = DOCUMENT.activeElement;
      var clear;
      
      if (active_element && active_element.classList.contains("volt-dialog-close")) {
        dialog.close();
        return;
      }
      if (!dialog.open) {
        if (!dialog.showModal) {
          DIALOG_POLYFILL.registerDialog(dialog);
        }

        return gadget.getDeclaredGadget("map")
          .push(function (my_declared_gadget) {
            dict.map_gadget = my_declared_gadget;
            return RSVP.all([
              dict.map_gadget.render({
                "id": dict.country_id,
                "name_dict": dict.ui_dict,
                "selected": ""
              }),
              gadget.swapMenuClass()
            ]);
          })
          .push(function () {
            
            dialog.showModal();
            return dict.map_gadget.renderMap();
          })
          .push(function(marker_dict) {

            // only if language changed
            // language change
            // fix css so it stays side by side
            // fix popups with facebook/twitter/website links
            // show all europe pins on europe
            // set selected attribute based on global config
            updateSelect(dialog, marker_dict, dict.country_id, dict.ui_dict);
            window.componentHandler.upgradeElements(dialog);
          });
      }
      dialog.close();
      return;
    })
    
    // -------------------.--- Render ------------------------------------------
    .declareMethod("render", function (my_option_dict) {
      var gadget = this;
      var dict = gadget.property_dict;
      var header = dict.header;
      mergeDict(dict, my_option_dict);
      window.componentHandler.upgradeElements(header);
      return new RSVP.Queue()
        .push(function () {
          return gadget.remoteTranslate(my_option_dict.ui_dict, header);
        });
    })

    .declareMethod("swapMenuClass", function (my_list) {
      var dict = this.property_dict;
      if (my_list && my_list.classList.contains(RESPONSIVE_CLASS)) {
        my_list.classList.remove(RESPONSIVE_CLASS);
        return;
      }
      ARR.slice.call(dict.navbar_list).filter(function (el) {
        el.classList.remove(RESPONSIVE_CLASS);
      });
      if (my_list) {
        my_list.classList.add(RESPONSIVE_CLASS);
      }
    })

    /////////////////////////////
    // declared jobs
    /////////////////////////////

    /////////////////////////////
    // declared service
    /////////////////////////////

    /////////////////////////////
    // event bindings
    /////////////////////////////
    .onEvent("click", function (event) {
      var list = getParent(event.target, LIST);
      if (list) {
        return this.swapMenuClass(list);
      }
    }, false, false)

    .onEvent("change", function (event) {
      var el = event.target;
      return this.property_dict.map_gadget.renderMap(
        el.options[el.selectedIndex].value
      );
    }, false, false)

    .onEvent("submit", function (event) {
      switch (event.target.getAttribute(NAME)) {
        case "volt-dialog":
          return this.handleDialog(event);
        case "volt-fullscreen":
          return this.expandDialog(event, true);
        case "volt-minimize":
          return this.expandDialog(event);
      }
    }, false, true);

}(window, rJS, RSVP));
