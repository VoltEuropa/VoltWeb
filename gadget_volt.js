/*jslint maxlen: 80, indent: 2 */
/*global window, rJS, RSVP, JSON, Object, Blob */
(function (window, rJS, RSVP, JSON, Object, Blob) {
  "use strict";

  /////////////////////////////
  // parameters
  /////////////////////////////

  // let this be a site configuration dictionary (obviously missing a lot still)
  var OPTION_DICT = {
    "country_id": "fr"
  };

  var DICT = {};
  var ATTR = "data-attr";
  var I18N = "data-i18n";
  var LB = "[";
  var RB = "]";
  var HREF = "href";
  var STR = "";
  var TRANSLATION = "translation";
  var CONTENT ="content";
  var SETTINGS = "settings";
  var TEN_MINUTES = 600000;
  var DOCUMENT = window.document;
  var FALLBACK_PATH = "https://raw.githubusercontent.com/VoltEuropa/VoltWeb/master/lang/";
  var FALLBACK_LANGUAGE = "fr";

  /////////////////////////////
  // methods
  /////////////////////////////

  // ios OS9 doesn't support github api v3 redirects, create response by hand
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
      "path": "lang/" + my_language,
      "__debug": "https://softinst103163.host.vifib.net/site/lang/" + my_language + "/debug.json"
    };
  }

  function up(my_string) {
    return my_string.toUpperCase();
  }

  function getTimeStamp() {
    return new window.Date().getTime();
  }

  function getLang(nav) {
    return (nav.languages ? nav.languages[0] : (nav.language || nav.userLanguage));
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
    })

    /////////////////////////////
    // ready
    /////////////////////////////
    .ready(function (gadget) {

      // shabby. We should use content-storage for that, replicate with github
      // and repair should convert from github format into the format we require
      gadget.property_dict = {
        "content_dict": {},
        "ui_dict": {},
        "content_wrapper": getElem(gadget.element, ".volt-layout")
      };
      return RSVP.all([
        gadget.declareGadget("gadget_jio.html", {"scope": "content"}),
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

      // mdl-events still bound multiple times, stateChange is too slow to trap
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
          return gadget.buildContentLookupDict(true);
        })
        .push(function () {
          dict.stop = null;
          return;
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
            el.setAttribute(attr_pair[0], dictionary[attr_pair[1]]);
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
            return new RSVP.Queue()
              .push(function () {
                return gadget.resetStorage(true);
              })
              .push(function () {
                return gadget.setting_removeAttachment("/", "token");
              });
          }
          return payload[my_setting];
        })
        .push(undefined, function (my_error) {
          return gadget.handleError(my_error, {"404": undefined});
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

    .declareMethod("content_create", function (my_option_dict) {
      return this.route(CONTENT, "createJIO", my_option_dict);
    })
    .declareMethod("content_get", function (my_id) {
      return this.route(CONTENT, "get", my_id);
    })
    .declareMethod("content_put", function (my_id, my_meta_data) {
      return this.route(CONTENT, "put", my_id, my_meta_data);
    })
    .declareMethod("content_remove", function (my_id) {
      return this.route(CONTENT, "remove", my_id);
    })
    .declareMethod("content_putAttachment", function (my_id, my_name, my_blob) {
      return this.route(CONTENT, "putAttachment", my_id, my_name, my_blob);
    })
    .declareMethod("content_getAttachment", function (my_id, my_name, my_dict) {
      return this.route(CONTENT, "getAttachment", my_id, my_name, my_dict);
    })
    .declareMethod("content_removeAttachment", function (my_id, my_name) {
      return this.route(CONTENT, "removeAttachment", my_id, my_name);
    })
    .declareMethod("content_allAttachments", function (my_id) {
      return this.route(CONTENT, "allAttachments", my_id);
    })
    .declareMethod("content_allDocs", function (my_option_dict) {
      return this.route(CONTENT, "allDocs", my_option_dict);
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
          return RSVP.all([
            gadget.setting_create({"type": "local", "sessiononly": false}),
            gadget.content_create({"type": "indexeddb", "database": "volt"})
          ]);
        })
        .push(function () {
          return gadget.getSetting("lang");
        })
        .push(function (my_stored_language) {
          if (my_stored_language === undefined) {
            return RSVP.all([
              gadget.setSetting("lang", locale),
              gadget.github_create(getConfigDict(locale))
            ]);
          }
          dict.country_id = my_stored_language;
          return RSVP.all([
            gadget.stateChange({"locale": my_stored_language}),
            gadget.github_create(getConfigDict(my_stored_language))
          ]);
        })
        .push(function () {
          return gadget.buildContentLookupDict();
        })
        .push(function () {
          return RSVP.all([
            gadget.getDeclaredGadget("header"),
            gadget.getDeclaredGadget("footer")
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

    // ---------------------- Data Handlers --------------------------------------
    .declareMethod("getRemoteDataUrlIndex", function () {
      var gadget = this;
      return new RSVP.Queue()
        .push(function () {
          return gadget.github_allDocs();
        })

        // we only need language to build the dict, so in case of errors on
        // OS X/Safari 9, which cannot handle Github APIv3 redirect, we just
        // build the thing by hand.
        .push(undefined, function (whatever) {
          return getFallbackDict(gadget.state.locale);
        })

        // call passed but set language (eg XX) does not exist, use fallback
        .push(function (response) {
          if (response.data.total_rows > 0) {
            return response;
          }
          return gadget.updateStorage(FALLBACK_LANGUAGE)
            .push(function () {
              return RSVP.all([
                gadget.github_allDocs()
                  .push(function (document_dict) {
                    return new RSVP.Queue()
                      .push(function () {
                        return RSVP.all(
                          document_dict.data.rows.map(function (row) {
                            return gadget.content_put(row.id, DICT);  
                          })
                        );
                      })
                      .push(function () {
                        return document_dict;
                      });
                  }),
                  gadget.setSetting("lang", FALLBACK_LANGUAGE),
                  gadget.stateChange({"locale": FALLBACK_LANGUAGE})
                ]);
            })
            .push(function (response_list) {
              return response_list[0];
            });
        });
    })

    .declareMethod("getRemoteData", function (my_url_list) {
      var gadget = this;
      return new RSVP.Queue()
        .push(function () {
          return RSVP.all(my_url_list.map(function (row) {
            return gadget.github_get(row.id)
              .push(function (data) {
                return new RSVP.Queue()
                  .push(function () {
                    return gadget.content_putAttachment(
                      row.id,
                      "data",
                      new Blob([JSON.stringify(data)], {type: "application/json"})
                    );
                  })
                  .push(function () {
                    return data;
                  });
              });
          }));
        })
        .push(function (response_list) {
          return mergeDict(response_list[0], response_list[1]);
        });
    })


    .declareMethod("buildContentLookupDict", function (my_purge) {
      var gadget = this;
      var dummy_response = [DICT, DICT];
      var queue = new RSVP.Queue();
      var url_list;

      // indexeddb first, if not available/change language = purge), ask remote
      if (my_purge === undefined) {
        queue.push(function () {
          return gadget.content_allDocs();
        });
      }

      return queue
        .push(function (response) {
          if (response && response.data.total_rows > 0) {
            return response;
          }
          return gadget.getRemoteDataUrlIndex();
        })

        //this response will not be empty (from indexeddb or github or fallback)
        .push(function (document_dict) {
          url_list = document_dict.data.rows.filter(function (x) {
            return x.id.indexOf("debug") === -1;
          });
          return RSVP.all(url_list.map(function (row) {
            return gadget.content_getAttachment(row.id, "data", {"format": "json"});
          }));
        })

        // in case something fails
        .push(undefined, function (my_error) {
          return gadget.handleError(my_error, {"404": dummy_response});
        })
        .push(function (response_list) {
          var list = response_list || dummy_response;
          var data = mergeDict(list[0], list[1]);

          // if indexeddb is empty we need to fetch remote data
          if (Object.keys(data).length === 0 && data.constructor === Object) {
            return gadget.getRemoteData(url_list);
          }
          return data;
        })

        // getRemoteData or the previous call return a merged dict
        .push(function (data_dict) {
          var dict = gadget.property_dict;
          dict.ui_dict = data_dict;
          return gadget.translateDom([data_dict, dict.content_wrapper]);
        });
    })

    // wipe indexeddb
    .declareMethod("resetStorage", function (my_purge) {
      console.log("PURGING")
      var gadget = this;
      return new RSVP.Queue()
        .push(function () {
          return gadget.content_allDocs();
        })
        .push(function (document_list) {
          return RSVP.all(
            document_list.data.rows.map(function (row) {
              return gadget.content_allAttachments(row.id)
                .push(function (attachment_dict) {
                  return RSVP.all(
                    Object.keys(attachment_dict).map(function (key) {
                      return gadget.content_removeAttachment(row.id, key);
                    })
                  );
                })
                .push(function () {
                  return gadget.content_remove(row.id);
                });
            })
          );
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

}(window, rJS, RSVP, JSON, Object, Blob));