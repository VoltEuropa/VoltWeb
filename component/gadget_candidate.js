/*jslint maxlen: 80, indent: 2 */
/*global window, rJS, RSVP */
(function (window, rJS, RSVP) {
  "use strict";

  /////////////////////////////
  // parameters
  /////////////////////////////
  var BLANK = "_blank";
  var BREAK = "\r\n";
  var STR = "";
  var SPACE = " ";
  var SLASH = "/";
  var NAME = "name";
  var ON = "on";
  var DOCUMENT = window.document;
  var LOCATION = DOCUMENT.location;
  var THX = "url-site-thanks";

  /////////////////////////////
  // methods
  /////////////////////////////
  function getBody(my_dict, my_target) {
    var ui_dict = my_dict.ui_dict;
    var dot = ui_dict["contact-colon"];
    var yes = ui_dict["contact-Yes"];
    var no = ui_dict["contact-No"];

    // mh
    return window.encodeURIComponent(
      ui_dict["candidate-Last Name"] + dot + my_target.candidate_last_name.value.toUpperCase() + BREAK +
      ui_dict["candidate-First Name"] + dot + my_target.candidate_first_name.value + BREAK +
      ui_dict["candidate-Age"] + dot + my_target.candidate_age + BREAK +
      ui_dict["candidate-Zip Code"] + dot + my_target.candidate_zip_code + BREAK +
      ui_dict["candidate-Validity"] + dot + my_target.candidate_validity + BREAK +
      ui_dict["candidate-Declaration"] + dot + my_target.candidate_declaration + BREAK
    );
  }

  function getSubject(my_dict, my_target) {
    var ui_dict = my_dict.ui_dict;
    return window.encodeURIComponent(
      "[" + my_dict.scope + "]" + ui_dict["candidate-Candidate"] + " : " + 
        my_target.contact_first_name.value + SPACE +
          my_target.contact_last_name.value.toUpperCase()
    );
  }

  function crop(my_scope) {
    var arr = my_scope.split(SLASH);
    return arr.splice(0, arr.length - 1).join(SLASH);
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

  /////////////////////////////
  // start
  /////////////////////////////
  rJS(window)

    /////////////////////////////
    // state
    /////////////////////////////

    /////////////////////////////
    // ready
    /////////////////////////////
    .ready(function (gadget) {
      gadget.property_dict = {
        "form_container": getElem(gadget.element, ".volt-form")
      };
    })

    /////////////////////////////
    // published methods
    /////////////////////////////

    /////////////////////////////
    // acquired methods
    /////////////////////////////
    .declareAcquiredMethod("remoteTranslate", "remoteTranslate")
    .declareAcquiredMethod("getSocialMediaSource", "getSocialMediaSource")

    /////////////////////////////
    // declared methods
    /////////////////////////////

    // -------------------.--- Render ------------------------------------------
    .declareMethod("render", function (my_option_dict) {
      var gadget = this;
      var dict = gadget.property_dict;
      mergeDict(dict, my_option_dict || {});
      window.componentHandler.upgradeElements(dict.form_container);
      gadget.remoteTranslate(dict.ui_dict, dict.form_container);
    })

    .declareMethod("getDestinationDict", function (my_scope) {
      var gadget = this;
      return gadget.getSocialMediaSource(my_scope)
        .push(function (my_dict) {
          var destination = my_dict.lead_url || my_dict.contact_url;
          if (destination === undefined) {
            return gadget.getDestinationDict(crop(my_scope));
          }
          return destination;
        });
    })

    .declareMethod("submitContactForm", function (my_target) {
      var gadget = this;
      var dict = gadget.property_dict;
      var config = dict.form_dict;
      var action = config ? config[my_target.getAttribute(NAME)].action : undefined;
      var queue = new RSVP.Queue();

      if (action === undefined) {
        queue.push(function () {
          return gadget.getDestination(dict.scope);
        });
      }

      return queue
        .push(function (my_source) {
          window.open(action || my_source + "?subject=" + getSubject(dict, my_target) +
            "&body=" + getBody(dict, my_target), "_blank"
          );
          return LOCATION.assign("../" + dict.selected_language + "/" + dict.ui_dict[THX]);
        });
    })
    
    /////////////////////////////
    // declared service
    /////////////////////////////

    /////////////////////////////
    // event bindings
    /////////////////////////////
    .onEvent("submit", function (event) {
      switch (event.target.getAttribute(NAME)) {
        case "volt-form__condidate":
          return this.submitContactForm(event.target);
      }
    });

}(window, rJS, RSVP));
