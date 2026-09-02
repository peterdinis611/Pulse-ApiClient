(function () {
  function fail(message) {
    throw new Error(String(message));
  }

  function isObject(value) {
    return value !== null && typeof value === "object";
  }

  function deepEqual(left, right) {
    if (left === right) return true;
    if (typeof left !== typeof right) return false;
    if (left === null || right === null) return left === right;
    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length) return false;
      for (var i = 0; i < left.length; i += 1) {
        if (!deepEqual(left[i], right[i])) return false;
      }
      return true;
    }
    if (isObject(left) && isObject(right) && !Array.isArray(left) && !Array.isArray(right)) {
      var leftKeys = Object.keys(left);
      var rightKeys = Object.keys(right);
      if (leftKeys.length !== rightKeys.length) return false;
      for (var k = 0; k < leftKeys.length; k += 1) {
        var key = leftKeys[k];
        if (!deepEqual(left[key], right[key])) return false;
      }
      return true;
    }
    return false;
  }

  function stringify(value) {
    if (value === undefined) return "undefined";
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return String(value);
    }
  }

  function typeName(value) {
    if (value === undefined) return "undefined";
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
  }

  function lengthOf(value) {
    if (typeof value === "string" || Array.isArray(value)) return value.length;
    if (isObject(value)) return Object.keys(value).length;
    return 0;
  }

  function isEmpty(value) {
    if (value === undefined || value === null) return true;
    if (typeof value === "string" || Array.isArray(value)) return value.length === 0;
    if (isObject(value)) return Object.keys(value).length === 0;
    return false;
  }

  function includesValue(haystack, needle) {
    if (typeof haystack === "string") return haystack.indexOf(String(needle)) !== -1;
    if (Array.isArray(haystack)) {
      for (var i = 0; i < haystack.length; i += 1) {
        if (deepEqual(haystack[i], needle)) return true;
      }
      return false;
    }
    return String(haystack).indexOf(String(needle)) !== -1;
  }

  function createExpect(actual) {
    var negated = false;
    function check(ok, message) {
      if (negated ? ok : !ok) fail(message);
    }
    var chain = {
      to: {}
    };
    Object.defineProperty(chain, "not", {
      get: function () {
        negated = !negated;
        return chain;
      }
    });
    Object.defineProperty(chain.to, "not", {
      get: function () {
        negated = !negated;
        return chain.to;
      }
    });
    chain.to.eql = chain.to.equal = function (expected) {
      check(deepEqual(actual, expected), "Expected " + stringify(actual) + " to equal " + stringify(expected));
      return chain;
    };
    chain.to.deep = { equal: chain.to.eql };
    chain.to.include = chain.to.contain = function (needle) {
      check(includesValue(actual, needle), "Expected " + stringify(actual) + " to include " + stringify(needle));
      return chain;
    };
    chain.to.match = function (pattern) {
      var regex = pattern instanceof RegExp ? pattern : new RegExp(String(pattern));
      check(regex.test(String(actual)), "Expected " + stringify(actual) + " to match " + regex);
      return chain;
    };
    chain.to.have = {
      lengthOf: function (expected) {
        var len = lengthOf(actual);
        check(len === expected, "Expected length " + expected + ", got " + len);
        return chain;
      },
      property: function (key, expected) {
        var exists = isObject(actual) && Object.prototype.hasOwnProperty.call(actual, key);
        if (expected === undefined) {
          check(exists, "Expected property `" + key + "` to exist");
        } else {
          check(exists && deepEqual(actual[key], expected), "Expected property `" + key + "` to equal " + stringify(expected));
        }
        return chain;
      }
    };
    chain.to.be = {
      a: function (expected) {
        check(typeName(actual) === expected, "Expected type `" + expected + "`, got `" + typeName(actual) + "`");
        return chain;
      },
      below: function (limit) {
        check(Number(actual) < Number(limit), "Expected " + actual + " to be below " + limit);
        return chain;
      },
      above: function (limit) {
        check(Number(actual) > Number(limit), "Expected " + actual + " to be above " + limit);
        return chain;
      },
      at: {
        least: function (limit) {
          check(Number(actual) >= Number(limit), "Expected " + actual + " to be at least " + limit);
          return chain;
        },
        most: function (limit) {
          check(Number(actual) <= Number(limit), "Expected " + actual + " to be at most " + limit);
          return chain;
        }
      }
    };
    chain.to.be.an = chain.to.be.a;
    Object.defineProperty(chain.to.be, "true", {
      get: function () {
        check(actual === true, "Expected true, got " + stringify(actual));
        return chain;
      }
    });
    Object.defineProperty(chain.to.be, "false", {
      get: function () {
        check(actual === false, "Expected false, got " + stringify(actual));
        return chain;
      }
    });
    Object.defineProperty(chain.to.be, "null", {
      get: function () {
        check(actual === null, "Expected null, got " + stringify(actual));
        return chain;
      }
    });
    Object.defineProperty(chain.to.be, "undefined", {
      get: function () {
        check(actual === undefined, "Expected undefined, got " + stringify(actual));
        return chain;
      }
    });
    Object.defineProperty(chain.to.be, "empty", {
      get: function () {
        check(isEmpty(actual), "Expected empty value, got " + stringify(actual));
        return chain;
      }
    });
    Object.defineProperty(chain.to.be, "ok", {
      get: function () {
        check(Boolean(actual), "Expected a truthy value");
        return chain;
      }
    });
    return chain;
  }

  function headerMap(headers) {
    var map = {};
    (headers || []).forEach(function (header) {
      map[String(header.key).toLowerCase()] = header.value;
    });
    return {
      get: function (name) {
        return map[String(name).toLowerCase()];
      }
    };
  }

  function bindResponse(response) {
    var headers = headerMap(response.headers || []);
    var parsedJson;
    function json() {
      if (parsedJson === undefined) {
        parsedJson = response.body ? JSON.parse(response.body) : null;
      }
      return parsedJson;
    }
    var api = {
      code: response.status,
      status: response.status,
      statusText: response.statusText || "",
      responseTime: response.elapsedMs || 0,
      headers: headers,
      json: json,
      text: function () { return response.body || ""; },
      size: function () { return response.sizeBytes || (response.body ? response.body.length : 0); },
      to: {
        have: {
          status: function (expected) {
            if (api.code !== expected) fail("Expected status " + expected + ", got " + api.code);
          },
          header: function (key, expected) {
            var value = headers.get(key);
            if (value === undefined) fail("Header `" + key + "` not found");
            if (expected !== undefined && String(value).toLowerCase().indexOf(String(expected).toLowerCase()) === -1) {
              fail("Header `" + key + "` expected to include `" + expected + "`, got `" + value + "`");
            }
          }
        },
        not: {
          have: {
            status: function (unexpected) {
              if (api.code === unexpected) fail("Expected status not to be " + unexpected);
            }
          }
        },
        be: {}
      }
    };
    Object.defineProperty(api.to.be, "ok", {
      get: function () {
        if (api.code < 200 || api.code >= 300) fail("Expected 2xx status, got " + api.code);
      }
    });
    Object.defineProperty(api.to.be, "clientError", {
      get: function () {
        if (api.code < 400 || api.code >= 500) fail("Expected 4xx client error, got " + api.code);
      }
    });
    Object.defineProperty(api.to.be, "serverError", {
      get: function () {
        if (api.code < 500 || api.code >= 600) fail("Expected 5xx server error, got " + api.code);
      }
    });
    Object.defineProperty(api.to.be, "redirect", {
      get: function () {
        if (api.code < 300 || api.code >= 400) fail("Expected 3xx redirect, got " + api.code);
      }
    });
    return api;
  }

  var envStore = Object.assign({}, globalThis.__pulseEnv || {});
  var mutations = [];

  function setEnv(key, value) {
    var name = String(key || "").trim();
    if (!name) return;
    var next = value === undefined || value === null ? "" : String(value);
    envStore[name] = next;
    for (var i = mutations.length - 1; i >= 0; i -= 1) {
      if (mutations[i].key === name) mutations.splice(i, 1);
    }
    mutations.push({ key: name, value: next });
  }

  function getEnv(key) {
    return envStore[String(key || "").trim()];
  }

  var tests = [];
  var pulse = {
    test: function (name, fn) {
      try {
        fn();
        tests.push({ name: String(name), passed: true, message: null });
      } catch (error) {
        tests.push({
          name: String(name),
          passed: false,
          message: error && error.message ? String(error.message) : String(error)
        });
      }
    },
    expect: createExpect,
    environment: { set: setEnv, get: getEnv },
    variables: { set: setEnv, get: getEnv },
    collectionVariables: { set: setEnv, get: getEnv },
    globals: { set: setEnv, get: getEnv },
    response: bindResponse(globalThis.__pulseResponse || {
      status: 0,
      statusText: "",
      headers: [],
      body: "",
      elapsedMs: 0,
      sizeBytes: 0
    })
  };

  globalThis.pulse = pulse;
  globalThis.pm = pulse;
  globalThis.__pulseTests = tests;
  globalThis.__pulseMutations = mutations;
})();
