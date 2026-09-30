// bpmn-js ships no TypeScript declarations; declare the deep imports we use as `any`.
declare module "bpmn-js/lib/Modeler" {
  const BpmnModeler: any;
  export default BpmnModeler;
}
declare module "bpmn-js/lib/NavigatedViewer" {
  const NavigatedViewer: any;
  export default NavigatedViewer;
}
