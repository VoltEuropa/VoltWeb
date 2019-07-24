/*jslint maxlen: 80, indent: 2 */
/*global window, rJS, RSVP, JSON, Object, Blob */
(function (window, rJS, RSVP, JSON, Object, Blob) {
  "use strict";

  /////////////////////////////
  // parameters
  /////////////////////////////

  // page acquisition would be great but it would mean, pages need to be fetched
  // by renderjs and we will have a page renderer, can we do this
  // if we are on campagin, we try to find fr/lille campaign and if it doesn't exist
  // we pick fr campaign ? this would allow to have city specific pages with city meta
  // tags. Ok,
  // so pages structure should be ... ? en/Lille, fr/Lille/index.html, 
  // so we stay in
  // | page
  // | - en
  // | --- Lille
  // | - fr
  // | --- Lille
  // | --- Armentieres
  // this means we could also have a french page if we go to page/fr/
  // ok, do this and then
  // - fix map gadget
  // - fix settings gadget (race condition and when to reload)

  var OPTION_DICT = {
    "scope": "fr",
    "localiser": "EU/FR/Lille"
  };

  var DICT = {};
  var ATTR = "data-attr";
  var I18N = "data-i18n";
  var LB = "[";
  var RB = "]";
  var HREF = "href";
  var STR = "";
  var MAIN = "volt-layout__content";
  var GITHUB = "github";
  var CONTENT ="content";
  var SETTINGS = "settings";
  var IDLE_TIME = 600000;
  var DOCUMENT = window.document;
  var LOCATION = document.location;
  var FALLBACK_PATH = "https://raw.githubusercontent.com/VoltEuropa/VoltWeb/master/lang/";
  var FALLBACK_LANGUAGE = "fr";
  var ESC = "Esc";
  var ESCAPE = "Escape";

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
      "user": "VoltEuropa",
      "repo": "VoltWeb",
      "path": "lang/" + my_language
    };
  }

  function getParent(my_element, my_class) {
    if (my_element && my_element.classList.contains(my_class)) {
      return my_element;
    }
    if (my_element.parentElement) {
      return getParent(my_element.parentElement, my_class);
    }
    return null;
  }

  function getTarget(my_dict, my_path) {
    var key;
    if (my_path) {
      for (key in my_dict) {
        if (my_dict[key] === my_path) {
          return key;
        }
      }
    }
  }

  function up(my_string) {
    return my_string.toUpperCase();
  }

  function getTimeStamp() {
    return new window.Date().getTime();
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
      "scope": null, // the default language, which should be named like this...
      "locale": null, // the language the user picked
      "localiser": null // the path where this site is
    })

    /////////////////////////////
    // ready
    /////////////////////////////
    .ready(function (gadget) {
      gadget.property_dict = {
        "ui_dict": {},
        "content_wrapper": getElem(gadget.element, ".volt-layout")
      };

      return RSVP.all([
        gadget.declareGadget("../../gadget_jio.html", {"scope": "content"}),
        gadget.declareGadget("../../gadget_jio_githubstorage.html", {"scope": "github"}),
        gadget.declareGadget("../../gadget_jio.html", {"scope": "settings"})
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
      return this.updateLanguage(my_event);
    })

    .allowPublicAcquisition("buildDataLookupDict", function (my_query) {
      var gadget = this;
      var query = my_query ? "+" + my_query : STR;
      var localiser = gadget.state.localiser.replace(/\//g, "-");
      var reply = {"data": {"rows": [], "total_rows": undefined}};

      // since we can't search file contents on indexeddb, we always hit Github
      // which can search file content - rate limit = 10 searches/minute
      return new RSVP.Queue()
        .push(function () {
          return gadget.github_allDocs({"query": gadget.state.localiser + query});
        })
        .push(function (response) {
          return RSVP.all(response.data.rows
            .filter(function (dict) {
              if (dict.id.indexOf(localiser) > -1) {
                return dict;
              }
            }).map(function (dict) {
              var portal_type = dict.id.split(localiser)[1].split(".")[1];
              return new RSVP.Queue()
                .push(function () {
                  return new RSVP.Queue()
                    .push(function () {
                      return gadget.content_get(portal_type);
                    })
                    .push(undefined, function (error) {
                      return gadget.handleError(error, {"404": gadget.content_put(portal_type)});
                    });
                })
                .push(function () {
                  return gadget.content_getAttachment(portal_type, dict.id, {"format": "json"});
                })
                .push(undefined, function (error) {
                  return gadget.handleError(error, {"404": gadget.github_get(dict.id)});
                })
                .push(function (file) {
                  reply.data.rows.push(file);
                  return gadget.content_putAttachment(
                    portal_type,
                    dict.id,
                    new Blob([JSON.stringify(file)], {type: "application/json"})
                  );
                });
            })
          );
        })
        .push(function () {
          reply.data.total_rows = reply.data.rows.length;
          return reply;
        });
    })

    /////////////////////////////
    // declared methods
    /////////////////////////////
    .declareMethod("updateLanguage", function (my_payload) {
      var gadget = this;
      var dict = gadget.property_dict;
      var select;
      var locale;
      var language;

      // mdl-events still fire multiple times, stateChange is too slow to trap
      if (dict.stop) {
        return;
      }
      dict.stop = true;

      // if language was selected, use it, else fallback to default scope
      if (my_payload) {
        select = my_payload[0].target;
        language = select.options[select.selectedIndex].value;
      } else {
        language = gadget.state.scope;
      }
      locale = gadget.state.locale;
      if (locale === language) {
        return;
      }

      // update storages with new language data, then load target/index page
      return new RSVP.Queue()
        .push(function () {
          return gadget.getSetting("pointer")
        })
        .push(function () {
          return gadget.resetStorage();
        })
        .push(function () {
          return RSVP.all([
            gadget.setSetting("locale", language),
            gadget.updateStorage(language)
          ]);
        })
        .push(function () {
          return RSVP.all([
            gadget.getSetting("pointer"),
            gadget.buildContentLookupDict(true)
          ]);
        })
        .push(function (response_list) {
          var target = response_list[0];
          return document.location.assign(
            "../" + language + "/" + (target ? dict.ui_dict[target] : STR)
          );
        });
    })
    
    .declareMethod("translateDom", function (my_payload) {
      var state = this.state;
      var dictionary;
      var dom;

      if (state.locale === state.scope) {
        return;
      }
      dictionary = my_payload[0];
      dom = my_payload[1];
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

    // ------------------------- Settings --------------------------------------
    .declareMethod("getSetting", function (my_setting) {
      var gadget = this;
      return gadget.setting_getAttachment("/", my_setting, {format: "text"})
        .push(function (response) {
          var payload = JSON.parse(response);
          if (getTimeStamp() - payload.timestamp > IDLE_TIME) {
            return new RSVP.Queue()
              .push(function () {
                return gadget.setting_removeAttachment("/", "token");
              })
              .push(function () {
                return gadget.updateLanguage();
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

    // ---------------------- JIO bridge ---------------------------------------
    // this is the JIO storage connectiong to the backend for content, in this
    // case we fetch everything from Github, but it might be plucked to any
    // other backend, implementing the same methods below
    .declareMethod("route", function (my_scope, my_call, my_p1, my_p2, my_p3) {
      var gadget = this;
      console.log(my_scope)
      return gadget.getDeclaredGadget(my_scope)
      .push(function (my_gadget) {
        return my_gadget[my_call](my_p1, my_p2, my_p3);
      });
    })

    .declareMethod("github_create", function (my_option_dict) {
      return this.route(GITHUB, "createJIO", my_option_dict);
    })
    .declareMethod("github_get", function (my_id) {
      return this.route(GITHUB, "get", my_id);
    })
    .declareMethod("github_allDocs", function (my_options) {
      return this.route(GITHUB, "allDocs", my_options);
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
            gadget.stateChange({
              "scope": dict.scope,
              "localiser": my_option_dict.localiser
            }),
            gadget.setting_create({"type": "local", "sessiononly": false}),
            gadget.content_create({"type": "indexeddb", "database": "volt"})
          ]);
        })
        .push(function () {
          return gadget.getSetting("locale");
        })
        .push(function (my_language) {
          var language = my_language || FALLBACK_LANGUAGE;

          // set those for all child gadgets
          dict.scope = gadget.state.scope;
          dict.locale = language;

          // reset setting, so we don't purge unless IDLE_TIME passed
          return RSVP.all([
            gadget.stateChange({"locale": language}),
            gadget.setSetting("locale", language)
          ]);
        })
        .push(function () {
          return gadget.github_create(getConfigDict(gadget.state.locale));
        })

        // get translations and data lookup dicts
        .push(function () {
          return gadget.buildContentLookupDict();
        })

        .push(function () {
          var gadget_list;

          // bäh, but some pages are plain content, some have a content gadget
          return RSVP.Queue()
            .push(function () {
              return RSVP.all([
                gadget.getDeclaredGadget("header"),
                gadget.getDeclaredGadget("footer"),
              ]);
            })
            .push(function (response_list) {
              gadget_list = response_list;
              return gadget.getDeclaredGadget("main")
                .push(function (response) {
                  gadget_list.push(response);
                  return gadget_list;
                })
                .push(undefined, function (error) {
                  if (error.name === "scopeerror") {
                    return gadget_list;
                  }
                  throw error;
                });
            });
        })

        .push(function (gadget_list) {
          return RSVP.all(gadget_list.map(function (gadget) {
            return gadget.render(dict);
          }));
        })
        .push(function () {
          window.componentHandler.upgradeDom();
          return gadget.translateDom(dict.ui_dict, dict.content_wrapper);
        })
        .push(function () {
          return gadget.setSetting(
            "pointer",
            getTarget(dict.ui_dict, LOCATION.href.split("/").pop())
          );
        });
    })

    // ---------------------- StateChange --------------------------------------
    .declareMethod("stateChange", function (delta) {
      var gadget = this;
      var state = gadget.state;
      if (delta.hasOwnProperty("locale")) {
        state.locale = delta.locale;
      }
      if (delta.hasOwnProperty("scope")) {
        state.scope = delta.scope;
      }
      if (delta.hasOwnProperty("localiser")) {
        state.localiser = delta.localiser;
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
        .push(function (response) {

          // call passed but set language (eg XX) does not exist, use fallback
          if (response.total_rows === 0) {
            return gadget.updateStorage(FALLBACK_LANGUAGE)
              .push(function () {
                return RSVP.all([
                  gadget.github_allDocs(),
                  gadget.setSetting("locale", FALLBACK_LANGUAGE),
                  gadget.stateChange({"locale": FALLBACK_LANGUAGE})
                ]);
              })
              .push(function (response_list) {
                return response_list[0];
              });
          }
          return response;
        })

        // store records in indexeddb to avoid roundtrip to github
        .push(function (response) {
          return new RSVP.Queue()
            .push(function () {
              return RSVP.all(
                response.rows.map(function (row) {
                  return gadget.content_put(row.id, DICT);  
                })
              );
            })
            .push(function () {
              return response;
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
          if (response && response.total_rows > 0) {
            return response;
          }
          return gadget.getRemoteDataUrlIndex();
        })

        //this response will not be empty (from indexeddb or github or fallback)
        .push(function (document_dict) {
          url_list = document_dict.rows.filter(function (x) {
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

        // for now tack ui_dict on props so they can be passed to child gadgets
        .push(function (data_dict) {
          gadget.property_dict.ui_dict = data_dict;
          return;
        });
    })

    // wipe indexeddb
    .declareMethod("resetStorage", function () {
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

    .declareMethod("hideMenu", function () {
      return this.getDeclaredGadget("header")
        .push(function (my_header_gadget) {
          return my_header_gadget.swapMenuClass();
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
    })

    /////////////////////////////
    // event bindings
    /////////////////////////////
    .onEvent("keydown", function (event) {
      if (event.key === ESCAPE || event.key === ESC) {
        return this.hideMenu();
      }
    }, false, false)

    .onEvent("click", function (event) {
      if (getParent(event.target, MAIN)) {
        return this.hideMenu();
      }
    }, false, false);

}(window, rJS, RSVP, JSON, Object, Blob));
