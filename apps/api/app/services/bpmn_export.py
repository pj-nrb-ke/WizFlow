"""Generate BPMN 2.0 XML — a blank canvas, and a one-way bridge from a WizFlow
linear workflow into a positioned BPMN diagram (for the Process Designer module).

This is a *visualisation* export only: it reads a workflow's steps and emits BPMN
XML. It never mutates the workflow and is not an execution engine.
"""

from __future__ import annotations

# A minimal, valid BPMN 2.0 document with a single start event — what a brand-new
# diagram opens with in the modeler.
EMPTY_DIAGRAM_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="160" y="122" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""

_CENTER_Y = 140
_GAP = 70


def _esc(s: str) -> str:
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def workflow_to_bpmn(name: str, steps: list) -> str:
    """Build positioned BPMN XML: Submitter (start) → one user task per step → Complete (end)."""
    nodes: list[dict] = [{"id": "StartEvent_1", "kind": "start", "name": "Submitter", "w": 36, "h": 36}]
    for i, s in enumerate(steps or []):
        label = (s.get("name") if isinstance(s, dict) else None) or f"Step {i + 1}"
        nodes.append({"id": f"Activity_{i + 1}", "kind": "task", "name": label, "w": 110, "h": 70})
    nodes.append({"id": "EndEvent_1", "kind": "end", "name": "Complete", "w": 36, "h": 36})

    # left→right layout on a single lane
    x = 160
    for n in nodes:
        n["x"] = x
        n["y"] = _CENTER_Y - n["h"] // 2
        x += n["w"] + _GAP

    flows = [
        {"id": f"Flow_{i + 1}", "src": nodes[i]["id"], "tgt": nodes[i + 1]["id"]}
        for i in range(len(nodes) - 1)
    ]
    out_of = {f["src"]: f["id"] for f in flows}
    in_of = {f["tgt"]: f["id"] for f in flows}

    # ── process elements ──
    els: list[str] = []
    for n in nodes:
        nid, nm = n["id"], _esc(n["name"])
        inc = f"<bpmn:incoming>{in_of[nid]}</bpmn:incoming>" if nid in in_of else ""
        outg = f"<bpmn:outgoing>{out_of[nid]}</bpmn:outgoing>" if nid in out_of else ""
        if n["kind"] == "start":
            els.append(f'<bpmn:startEvent id="{nid}" name="{nm}">{outg}</bpmn:startEvent>')
        elif n["kind"] == "end":
            els.append(f'<bpmn:endEvent id="{nid}" name="{nm}">{inc}</bpmn:endEvent>')
        else:
            els.append(f'<bpmn:userTask id="{nid}" name="{nm}">{inc}{outg}</bpmn:userTask>')
    for f in flows:
        els.append(f'<bpmn:sequenceFlow id="{f["id"]}" sourceRef="{f["src"]}" targetRef="{f["tgt"]}" />')

    # ── diagram interchange (shapes + edges) ──
    di: list[str] = []
    by_id = {n["id"]: n for n in nodes}
    for n in nodes:
        di.append(
            f'<bpmndi:BPMNShape id="{n["id"]}_di" bpmnElement="{n["id"]}">'
            f'<dc:Bounds x="{n["x"]}" y="{n["y"]}" width="{n["w"]}" height="{n["h"]}" />'
            f"</bpmndi:BPMNShape>"
        )
    for f in flows:
        a, b = by_id[f["src"]], by_id[f["tgt"]]
        x1, x2 = a["x"] + a["w"], b["x"]
        di.append(
            f'<bpmndi:BPMNEdge id="{f["id"]}_di" bpmnElement="{f["id"]}">'
            f'<di:waypoint x="{x1}" y="{_CENTER_Y}" />'
            f'<di:waypoint x="{x2}" y="{_CENTER_Y}" />'
            f"</bpmndi:BPMNEdge>"
        )

    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" '
        'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" '
        'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" '
        'xmlns:di="http://www.omg.org/spec/DD/20100524/DI" '
        'id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">\n'
        f'  <bpmn:process id="Process_1" name="{_esc(name)}" isExecutable="false">\n    '
        + "\n    ".join(els)
        + "\n  </bpmn:process>\n"
        '  <bpmndi:BPMNDiagram id="BPMNDiagram_1">\n'
        '    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">\n      '
        + "\n      ".join(di)
        + "\n    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n</bpmn:definitions>\n"
    )


if __name__ == "__main__":  # self-check: output is well-formed BPMN
    import xml.etree.ElementTree as ET

    xml = workflow_to_bpmn("Purchase Request", [{"name": "Manager Approval"}, {"name": "Finance Approval"}])
    root = ET.fromstring(xml)  # raises on malformed XML
    ns = "{http://www.omg.org/spec/BPMN/20100524/MODEL}"
    tasks = root.iter(f"{ns}userTask")
    assert len(list(tasks)) == 2, "expected one user task per step"
    assert len(list(root.iter(f"{ns}sequenceFlow"))) == 3, "expected start→t1→t2→end flows"
    assert "&amp;" in workflow_to_bpmn("A & B", [{"name": "x < y"}]), "names must be XML-escaped"
    ET.fromstring(EMPTY_DIAGRAM_XML)  # empty template is valid too
    print("bpmn_export self-check OK")
