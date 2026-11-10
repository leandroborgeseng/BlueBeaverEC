import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listenPorts } from "../listen-ports";

describe("listenPorts", () => {
  it("com PORT=8080 escuta só essa porta, mesmo se API_PORT for outra", () => {
    assert.deepEqual(listenPorts({ PORT: "8080", API_PORT: "3001" }), [8080]);
    assert.deepEqual(listenPorts({ PORT: " 8080 " }), [8080]);
    assert.equal(listenPorts({ PORT: "8080", API_PORT: "3001" }).length, 1);
  });

  it("sem PORT usa API_PORT e, se essa também faltar, 3001", () => {
    assert.deepEqual(listenPorts({ API_PORT: "4000" }), [4000]);
    assert.deepEqual(listenPorts({ PORT: "", API_PORT: "4000" }), [4000]);
    assert.deepEqual(listenPorts({ PORT: "   ", API_PORT: " 3001 " }), [3001]);
    assert.deepEqual(listenPorts({}), [3001]);
    assert.deepEqual(listenPorts({ PORT: "", API_PORT: "" }), [3001]);
  });

  it("não devolve duas portas", () => {
    const cases = [
      listenPorts({ PORT: "8080", API_PORT: "3001" }),
      listenPorts({ API_PORT: "3001" }),
      listenPorts({}),
    ];
    for (const ports of cases) {
      assert.equal(ports.length, 1);
      assert.equal(new Set(ports).size, 1);
    }
  });
});
