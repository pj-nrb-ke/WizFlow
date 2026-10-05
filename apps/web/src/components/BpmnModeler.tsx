import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import BpmnModeler from "bpmn-js/lib/Modeler";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";

export type BpmnHandle = {
  getXml: () => Promise<string>;
  getSvg: () => Promise<string>;
  importXml: (xml: string) => Promise<void>;
};

/**
 * Thin React wrapper around the bpmn-js modeler (imperative library).
 * Lazy-loaded so bpmn-js is code-split out of the core bundle.
 */
export type BpmnSelection = { id: string; type: string; name?: string };

const BpmnCanvas = forwardRef<BpmnHandle, { xml: string; onSelect?: (el: BpmnSelection | null) => void }>(
  function BpmnCanvas({ xml, onSelect }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<any>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useImperativeHandle(
    ref,
    () => ({
      getXml: async () => {
        const res = await modelerRef.current.saveXML({ format: true });
        return res.xml as string;
      },
      getSvg: async () => {
        const res = await modelerRef.current.saveSVG();
        return res.svg as string;
      },
      importXml: async (newXml: string) => {
        await modelerRef.current.importXML(newXml);
        modelerRef.current.get("canvas").zoom("fit-viewport");
      },
    }),
    []
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const modeler = new BpmnModeler({ container: containerRef.current });
    modelerRef.current = modeler;
    modeler.get("eventBus").on("selection.changed", (e: any) => {
      const el = e?.newSelection?.[0];
      onSelectRef.current?.(
        el ? { id: el.id, type: el.businessObject?.$type ?? el.type, name: el.businessObject?.name } : null
      );
    });
    (async () => {
      try {
        await modeler.importXML(xml);
        modeler.get("canvas").zoom("fit-viewport");
      } catch {
        /* malformed XML — modeler stays blank rather than crashing */
      }
    })();
    return () => modeler.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} style={{ height: "72vh", width: "100%" }} className="wf-card" />;
});

export default BpmnCanvas;
