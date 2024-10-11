"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var ConditionAction_exports = {};
__export(ConditionAction_exports, {
  ConditionAction: () => ConditionAction
});
module.exports = __toCommonJS(ConditionAction_exports);
class ConditionAction {
  constructor(condition, action, logger) {
    this.logger = logger;
    if (condition == null) {
      throw new Error("condition may not be null or undefined");
    }
    if (action == null) {
      throw new Error("action may not be null or undefined");
    }
    this.condition = condition;
    this.action = action;
  }
  condition;
  action;
  getAction() {
    return this.action;
  }
  setAction(action) {
    if (action == null) {
      throw new Error("action may not be null or undefined");
    }
    this.action = action;
  }
  getCondition() {
    return this.condition;
  }
  execute() {
    this.condition.evaluate().then((result) => {
      var _a, _b;
      if (result) {
        (_a = this.logger) == null ? void 0 : _a.logDebug(`Executing action because condition ${this.condition} evaluated to true`);
        this.action.execute();
      } else {
        (_b = this.logger) == null ? void 0 : _b.logDebug(
          `Not executing action because condition ${this.condition} evaluated to false`
        );
      }
    }).catch((e) => {
      var _a;
      (_a = this.logger) == null ? void 0 : _a.logError(`Error while evaluating condition: ${this.condition}, ${e}`);
    });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ConditionAction
});
//# sourceMappingURL=ConditionAction.js.map
