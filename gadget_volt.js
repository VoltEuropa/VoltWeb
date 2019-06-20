/*jslint maxlen: 80, indent: 2 */
/*global window, rJS, RSVP, JSON */
(function (window, rJS, RSVP, JSON) {
  "use strict";

  /////////////////////////////
  // parameters
  /////////////////////////////

  // let this be a site configuration dictionary (obviously missing parameters)
  var OPTION_DICT = {
    "country_id": "fr"
  };

  var DICT = {};
  var ATTR = "data-attr";
  var I18N = "data-i18n";
  var LB = "[";
  var RB = "]";
  var STR = "";
  var TRANSLATION = "translation";
  var SETTINGS = "settings";
  var TEN_MINUTES = 600000;
  var DOCUMENT = window.document;
  var FALLBACK_PATH = "https://raw.githubusercontent.com/VoltEuropa/VoltWeb/master/lang/";
  var FALLBACK_LANGUAGE = "fr";
  /////////////////////////////
  // methods
  /////////////////////////////
  function up(my_string) {
    return my_string.toUpperCase();
  }

  function getTimeStamp() {
    return new window.Date().getTime();
  }

  function getLang(nav) {
    return (nav.languages ? nav.languages[0] : (nav.language || nav.userLanguage));
  }

  function getFallbackDict (my_locale) {
    return {
      "rows": [
        {"id": FALLBACK_PATH + my_locale + "/names.json", "value": DICT},
        {"id": FALLBACK_PATH + my_locale + "/ui.json", "value": DICT}
      ],
      "total_rows": 2
    };
  }

  // this could be passed in default option-dict
  function getConfigDict(my_language) {
    return {
      "type": "github_storage",
      "repo": "VoltWeb",
      "path": "lang/" + my_language
      //"__debug": "https://softinst103163.host.vifib.net/site/lang/" + my_language + "/debug.json"
    };
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

  function isString(x) {
    return Object.prototype.toString.call(x) === "[object String]";
  }

  rJS(window)

    /////////////////////////////
    // state
    /////////////////////////////
    .setState({
      "locale": getLang(window.navigator).substring(0, 2) || FALLBACK_LANGUAGE,
      "ios": null,
    })

    /////////////////////////////
    // ready
    /////////////////////////////
    .ready(function (gadget) {

      // yaya, should be localstorage caling repair to sync
      gadget.property_dict = {
        "url_dict": {},
        "content_dict": {},
        "ui_dict": {},
        "content_wrapper": getElem(gadget.element, ".volt-layout")
      };
      return RSVP.all([
        gadget.declareGadget("gadget_jio.html", {"scope": "translation"}),
        gadget.declareGadget("gadget_jio.html", {"scope": "settings"})
      ]);
    })

    /////////////////////////////
    // published methods
    /////////////////////////////
    // poor man's i18n translations
    .allowPublicAcquisition("remoteTranslate", function (my_payload) {
      return this.translateDom(my_payload);
    })

    .allowPublicAcquisition("changeLanguage", function (my_event) {
      var gadget = this;
      var select = my_event[0].target;
      var dict = gadget.property_dict;
      var lang = select.options[select.selectedIndex].value;

      // mdl-events still bound multiple times, stateChange is too slow to trp
      if (dict.stop) {
        return;
      }
      dict.stop = true;
      if (gadget.state.locale === lang) {
        return;
      }
      return new RSVP.Queue()
        .push(function () {
          return RSVP.all([
            gadget.updateStorage(lang),
            gadget.setSetting("lang", lang)
          ]);
        })
        .push(function () {
          return gadget.buildContentLookupDict();
        })
        .push(function () {
          dict.stop = null;
          return gadget.fetchTranslationAndUpdateDom();
        });
    })

    /////////////////////////////
    // declared methods
    /////////////////////////////
    .declareMethod("translateDom", function (my_payload) {
      var dictionary = my_payload[0];
      var dom = my_payload[1];
      if (dom && !isString(dom)) {

        // translate texts
        dom.querySelectorAll(LB + I18N + RB).forEach(function (el) {
          el.textContent = dictionary[el.getAttribute(I18N)];
        });

        // set attributes
        dom.querySelectorAll(LB + ATTR + RB).forEach(function (el) {
          var attr_list = el.getAttribute(ATTR).split(";");
          attr_list.forEach(function (attr_value_pair) {
            var attr_pair = attr_value_pair.split(":");
            el.setAttribute(attr_pair[0], attr_pair[1]);
          });
        });
      }
    })

    // ------------------------- Settings --------------------------------------
    .declareMethod("getSetting", function (my_setting) {
      var gadget = this;
      return gadget.setting_getAttachment("/", my_setting, {format: "text"})
        .push(function (response) {
          var payload = JSON.parse(response);
          if (getTimeStamp() - payload.timestamp > TEN_MINUTES) {
            return gadget.setting_removeAttachment("/", "token");
          }
          return payload[my_setting];
        })
        .push(undefined, function (my_error) {
          return gadget.handleError(my_error, {"404": 0});
        });
    })

    .declareMethod("setSetting", function (my_setting, my_value) {
      var payload = {"timestamp": getTimeStamp()};
      payload[my_setting] = my_value;
      return this.setting_putAttachment("/", my_setting, new Blob([
        JSON.stringify(payload)
      ], {type: "text/plain"}));
    })

    .declareMethod("handleError", function (my_err, my_err_dict) {
      var code;
      var err = my_err.target ? JSON.parse(my_err.target.response).error : my_err;

      for (code in my_err_dict) {
        if (my_err_dict.hasOwnProperty(code)) {
          if ((err.status_code + STR) === code) {
            return my_err_dict[code];
          }
        }
      }
      throw err;
    })

    // ---------------------- JIO bridge ---------------------------------------
    // this is the JIO storage connectiong to the backend for content, in this
    // case we fetch everything from Github, but it might be plucked to any
    // other backend, implementing the same methods below
    .declareMethod("route", function (my_scope, my_call, my_p1, my_p2, my_p3) {
      var gadget = this;
      return gadget.getDeclaredGadget(my_scope)
      .push(function (my_gadget) {
        return my_gadget[my_call](my_p1, my_p2, my_p3);
      });
    })

    .declareMethod("github_create", function (my_option_dict) {
      return this.route(TRANSLATION, "createJIO", my_option_dict);
    })
    .declareMethod("github_get", function (my_id) {
      return this.route(TRANSLATION, "get", my_id);
    })
    .declareMethod("github_allDocs", function () {
      return this.route(TRANSLATION, "allDocs");
    })

    .declareMethod("setting_create", function (my_option_dict) {
      return this.route(SETTINGS, "createJIO", my_option_dict);
    })
    .declareMethod("setting_getAttachment", function (my_id, my_tag, my_dict) {
      return this.route(SETTINGS, "getAttachment", my_id, my_tag, my_dict);
    })
    .declareMethod("setting_putAttachment", function (my_id, my_tag, my_dict) {
      return this.route(SETTINGS, "putAttachment", my_id, my_tag, my_dict);
    })
    .declareMethod("setting_removeAttachment", function (my_id, my_tag) {
      return this.route(SETTINGS, "removeAttachment", my_id, my_tag);
    })

    // -------------------.--- Render ------------------------------------------
    .declareMethod("render", function (my_option_dict) {
      var gadget = this;
      var dict = gadget.property_dict;
      var locale = gadget.state.locale;
      mergeDict(dict, my_option_dict);

      return new RSVP.Queue()
        .push(function () {
          return gadget.setting_create({"type": "local", "sessiononly": false});
        })
        .push(function () {
          return gadget.getSetting("lang");
        })
        .push(function (my_stored_language) {
          if (my_stored_language !== 0) {
            dict.country_id = my_stored_language;
            return RSVP.all([
              gadget.stateChange({"locale": my_stored_language}),
              gadget.github_create(getConfigDict(my_stored_language))
            ]);
          }
          return RSVP.all([
            gadget.setSetting("lang", locale),
            gadget.github_create(getConfigDict(locale))
          ]);
        })
        .push(function () {
          return gadget.buildContentLookupDict();
        })
        .push(function () {
          return RSVP.all([
            gadget.getDeclaredGadget("header"),
            gadget.getDeclaredGadget("footer"),
            gadget.fetchTranslationAndUpdateDom()
          ]);
        })
        .push(function (gadget_list) {
          return RSVP.all([
            gadget_list[0].render(dict),
            gadget_list[1].render(dict)
          ]);
        })
        .push(function () {
          window.componentHandler.upgradeDom();
          return;
        });
    })

    // ---------------------- StateChange --------------------------------------
    .declareMethod("stateChange", function (delta) {
      var gadget = this;
      var state = gadget.state;
  
      if (delta.hasOwnProperty("locale")) {
        state.locale = delta.locale;
      }
      return;
    })

    .declareMethod("buildContentLookupDict", function () {
      var gadget = this;
      var dict = gadget.property_dict;

      return gadget.github_allDocs()

        // we only need a language to build the dict, so in case of errors like
        // on OS X/Safari 9, which cannot handle Github APIv3 redirect, we just
        // build the thing by hand.
        .push(undefined, function(whatever) {
          return getFallbackDict(gadget.state.locale);
        })
        .push(function (my_response) {
          if (my_response.data.total_rows === 0) {
            return gadget.updateStorage(FALLBACK_LANGUAGE)
              .push(function () {
                return gadget.github_allDocs();
              });
          }
          return my_response;
        })
        .push(function (my_data) {
          my_data.data.rows.map(function (row) {
            dict.url_dict[row.id.split("/").pop().replace(".json", "")] = row.id;
            return;
          });
        });
    })

    .declareMethod("fetchTranslationAndUpdateDom", function () {
      var gadget = this;
      var dict = gadget.property_dict;
      var url_dict = dict.url_dict;
      return new RSVP.Queue()
        .push(function () {
          return RSVP.all([
            gadget.github_get(url_dict.ui),
            gadget.github_get(url_dict.names)
          ]);
        })
        .push(function (data_list) {
          dict.ui_dict = mergeDict(data_list[0], data_list[1]);
          return gadget.translateDom([dict.ui_dict, dict.content_wrapper]);
        });
    })

    .declareMethod("updateStorage", function (my_language) {
      var gadget = this;
      if (my_language === gadget.state.locale) {
        return;
      }
      return new RSVP.Queue()
        .push(function () {
          return gadget.stateChange({"locale": my_language});
        })
        .push(function () {
          return gadget.github_create(getConfigDict(my_language));
        });
    })
    
    /////////////////////////////
    // declared service
    /////////////////////////////

    // start/entry point, initial render call and global error handler
    .declareService(function () {
      var gadget = this;

      return new RSVP.Queue()
        .push(function () {
          return gadget.render(OPTION_DICT);
        })
        .push(null, function (my_error) {
          throw my_error;

          // fail here
          var fragment = DOCUMENT.createDocumentFragment();
          var p = DOCUMENT.createElement("p");
          var br = DOCUMENT.createElement("br");
          var a = DOCUMENT.createElement("a");
          var body = DOCUMENT.getElementsByTagName('body')[0];
          p.classList.add("volt-error");
          p.textContent = "Sorry, we either messed up or your browser does not seem to support this application :( ";
          a.classList.add("volt-error-link");
          a.textContent = "www.voltfrance.org";
          a.setAttribute("href", "https://www.voltfrance.org/");
          fragment.appendChild(p);
          fragment.appendChild(br);
          fragment.appendChild(a);

          while (body.firstChild) {
            body.removeChild(body.firstChild);
          }
          body.appendChild(fragment);
        });
    });

}(window, rJS, RSVP, JSON));