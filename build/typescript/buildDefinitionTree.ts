import assert from "./assert";
import {
  getOrCreateNode,
  getOrCreateNodeAtPath,
  getNodeAtPath,
  getPropTypeFromInterface,
  getMethodTypesFromInterface,
  NodeMap,
  Node
} from "./treeUtils";
import { processType } from "./generateType";
import {
  ClassNode,
  EnumNode,
  FunctionNode,
  InterfaceNode,
  NamespaceNode,
  PropertyNode,
  TypeNode,
  DefinitionNode
} from "./nodes";
import { Definition, DefinitionType, FunctionDefinition } from "./base";

function parseClassNode(root: NodeMap, node: Node): ClassNode {
  assert(node.definition.type === DefinitionType.Class);
  const staticProperties = [];
  const staticMethods = [];
  const properties = [];
  const methods = [];
  const others = [];
  // Class might consist of only a constructor
  // Prototype defaults to empty in that case
  const prototype = node.children.get("prototype") || { children: new Map() };

  // Find interfaces for classes with implements keyword
  const interfaceName = node.definition.attributes.implements;
  const iface = interfaceName && getNodeAtPath(root, interfaceName.split("."));
  if (iface != null) {
    const attributes = iface.definition.attributes;
    // Only allow names of interfaces or typedefs for @implements
    assert(
      attributes.type === "interface" || attributes.type === "typedef",
      "Expected name of interface or typedef after implements keyword, got " +
        attributes.type
    );
  }

  // If interface could not be found, still proceed.
  // We assume the interface is a native interface in that case,
  // defined by one of TypeScript's base libs.

  // Gather all static members (static properties)
  for (const child of node.children.values()) {
    if (child.name === "prototype") {
      continue;
    }
    assert(
      child.definition !== null,
      "Unexpected child without definition in class statics: " +
        JSON.stringify(child, undefined, 2)
    );

    const type = child.definition.attributes.type || child.definition.type;
    switch (type) {
      case "const":
      case "property": {
        const attributes = child.definition.attributes;
        const isConst = attributes.type === "const";
        const rawType = isConst ? attributes.constType : attributes.propType;
        const type = processType(root, rawType);
        staticProperties.push(new PropertyNode(child.name, [], type, isConst));
        break;
      }
      case "function": {
        staticMethods.push(parseFunctionNode(root, child));
        break;
      }
      default:
        others.push(parseNode(root, child));
    }
  }

  // Gather all prototype members (instance properties)
  for (const child of prototype.children.values()) {
    assert(
      child.definition !== null,
      "Unexpected child without definition in class prototype: " +
        JSON.stringify(child, undefined, 2)
    );

    const type = child.definition.attributes.type || child.definition.type;
    switch (child.definition.type) {
      case "const":
      case "property": {
        const attributes = child.definition.attributes;
        let isConst = attributes.type === "const";
        let rawType = isConst ? attributes.constType : attributes.propType;
        if (!rawType && iface) {
          // Check if this property has been defined in the implemented
          // interface.
          const propType = getPropTypeFromInterface(iface, child.name);
          rawType = propType.rawType;
          isConst = propType.isConst;
        }
        const type = processType(root, rawType);
        properties.push(new PropertyNode(child.name, [], type, isConst));
        break;
      }
      case "function": {
        const attributes = child.definition.attributes;
        if ((!attributes.paramTypes || !attributes.returnType) && iface) {
          const types = getMethodTypesFromInterface(iface, child.name);
          attributes.paramTypes = attributes.paramTypes || types.paramTypes;
          attributes.returnType = attributes.returnType || types.returnType;
        }
        methods.push(parseFunctionNode(root, child));
        break;
      }
      default:
        throw new Error(
          `Found unexpected node type ${type} in class prototype`
        );
    }
  }

  const attributes = node.definition.attributes;

  // Include constructor description before class declaration as well,
  // as they can describe the constructor, the class, or both.
  const comments = [attributes.description];

  // Constructor
  const constructor = parseFunctionNode(
    root,
    node.definition.methods.find(m => m.kind === "constructor").value
  );

  return new ClassNode(
    node.name,
    comments,
    attributes.template,
    attributes.extends,
    interfaceName ? [interfaceName] : null,
    staticProperties,
    staticMethods,
    constructor,
    properties,
    methods,
    others.length > 0 ? new NamespaceNode(node.name, others) : null
  );
}

function parseInterfaceNode(root: NodeMap, node: Node): InterfaceNode {
  const properties = [];
  const methods = [];
  const others = [];
  const prototype = node.children.get("prototype");
  const attributes = node.definition.attributes;

  // Find interfaces for classes with implements keyword
  const baseInterfaceName = node.definition.attributes.extends;
  const baseInterface =
    baseInterfaceName && getNodeAtPath(root, baseInterfaceName.split("."));
  if (baseInterface != null) {
    const attributes = baseInterface.definition.attributes;
    // Only allow names of interfaces or typedefs for @implements
    assert(
      attributes.type === "interface" || attributes.type === "typedef",
      "Expected name of interface or typedef after extends keyword, got " +
        attributes.type
    );
  }
  // If interface could not be found, still proceed.
  // We assume the interface is a native interface in that case,
  // defined by one of TypeScript's base libs.

  // Gather all non-prototype members
  for (const child of node.children.values()) {
    if (child.name === "prototype") {
      continue;
    }
    assert(
      child.definition !== null,
      "Unexpected child without definition in interface statics: " +
        JSON.stringify(child, undefined, 2)
    );
    others.push(parseNode(root, child));
  }

  // Gather all prototype members
  for (const child of prototype.children.values()) {
    assert(
      child.definition !== null,
      "Unexpected child without definition in interface prototype: " +
        JSON.stringify(child, undefined, 2)
    );

    const type = child.definition.attributes.type || child.definition.type;
    switch (type) {
      case "const":
      case "property": {
        const attributes = child.definition.attributes;
        let isConst = attributes.type === "const";
        let rawType = isConst ? attributes.constType : attributes.propType;
        if (!rawType && baseInterface) {
          const type = getPropTypeFromInterface(baseInterface, child.name);
          rawType = type.rawType;
          isConst = type.isConst;
        }
        const type = processType(root, rawType);
        properties.push(new PropertyNode(child.name, [], type, isConst));
        break;
      }
      case "function": {
        if (
          (!attributes.paramTypes || !attributes.returnType) &&
          baseInterface
        ) {
          const types = getMethodTypesFromInterface(baseInterface, child.name);
          attributes.paramTypes = attributes.paramTypes || types.paramTypes;
          attributes.returnType = attributes.returnType || types.returnType;
        }
        methods.push(parseFunctionNode(root, child));
        break;
      }
      default:
        throw new Error(
          `Found unexpected node type ${type} in interface prototype`
        );
    }
  }

  return new InterfaceNode(
    node.name,
    attributes.comments,
    attributes.template,
    baseInterfaceName ? [baseInterfaceName] : null,
    properties,
    methods,
    others.length > 0 ? new NamespaceNode(node.name, others) : null
  );
}

function parseTypedefNode(root: NodeMap, node: Node): InterfaceNode | TypeNode {
  const attributes = node.definition.attributes;
  const typedefType = attributes.typedefType;

  if (attributes.props) {
    // Typedef defines an object structure, declare as interface
    const props = attributes.props.map(
      prop =>
        new PropertyNode(
          prop.name,
          prop.description ? [prop.description] : [],
          processType(root, prop.type)
        )
    );

    return new InterfaceNode(
      node.name,
      attributes.comments,
      null,
      null,
      props,
      [],
      null
    );
  }

  if (typedefType.type === "FunctionType" && typedefType.new) {
    // Type definition describes a class factory.
    // In TypeScript, these are declared as interfaces with a
    // 'new' method.

    // TypeScript doesn't allow nameless parameter declarations,
    // so we are just going to follow a p0, p1, ... schema.
    const params = typedefType.params.map((_, i) => "p" + i);
    const paramTypes = typedefType.params.reduce((acc, type, i) => {
      acc["p" + i] = type;
      return acc;
    }, {});

    const functionNode: Node = {
      name: "new",
      children: new Map(),
      definition: {
        type: "function",
        identifier: node.definition.identifier.concat(["new"]),
        params: params,
        attributes: {
          type: "function",
          description: "",
          comments: [],
          paramTypes: paramTypes,
          returnType: typedefType.this
        }
      } as FunctionDefinition
    };

    const methods = [parseFunctionNode(root, functionNode)];

    return new InterfaceNode(
      node.name,
      attributes.comments,
      null,
      null,
      [],
      methods,
      null
    );
  }

  // Normal type alias, return a type node
  return new TypeNode(
    node.name,
    attributes.comments,
    processType(root, typedefType, false)
  );
}

function parseEnumNode(node: Node) {
  const definition = node.definition;
  assert(
    definition.type === "object",
    `Expected enum ${node.name} to be defined with an object, got ${definition.type}`
  );

  return new EnumNode(
    node.name,
    definition.attributes.comments,
    definition.props
  );
}

function parseConstNode(root: NodeMap, node: Node) {
  const definition = node.definition;
  const attributes = definition.attributes;
  const constType = processType(root, attributes.constType);

  return new PropertyNode(node.name, attributes.comments, constType, true);
}

function parseFunctionNode(root: NodeMap, node: Node) {
  assert(node.definition.type === DefinitionType.Function);
  const attributes = node.definition.attributes;
  const paramTypes = attributes.paramTypes || {};

  const params = node.definition.params.map(name => {
    let type = {
      name: "any",
      isNullable: false
    };
    let isOptional = false;
    let isRest = false;
    if (paramTypes[name]) {
      type = processType(root, paramTypes[name]);
      isOptional = paramTypes[name].type === "OptionalType";
      isRest = paramTypes[name].type === "RestType";
    } else {
      console.warn(
        "Missing type information for parameter",
        name,
        "in function",
        node.definition.identifier.join(".")
      );
    }

    return {
      name,
      type,
      isOptional,
      isRest
    };
  });

  const returnType = attributes.returnType
    ? processType(root, attributes.returnType)
    : null;

  return new FunctionNode(
    node.name,
    attributes.comments,
    attributes.template,
    params,
    returnType
  );
}

function parseNode(root: NodeMap, node: Node): DefinitionNode {
  if (node.definition === null) {
    const nodes = [];
    for (const child of node.children.values()) {
      nodes.push(parseNode(root, child));
    }
    return new NamespaceNode(node.name, nodes);
  }

  const definition = node.definition;
  const attributes = definition.attributes;

  // If the doc comment didn't lead to a type, fall back to the type we got
  // from the declaration itself.
  // Types: const, enum, class, interface, function, property, object
  const type = attributes.type || definition.type;
  switch (type) {
    case "class":
      return parseClassNode(root, node);
    case "interface":
      return parseInterfaceNode(root, node);
    case "typedef":
      return parseTypedefNode(root, node);
    case "enum":
      return parseEnumNode(node);
    case "const":
      return parseConstNode(root, node);
    case "function":
      return parseFunctionNode(root, node);
    default:
      console.dir(node);
      throw new Error("Unexpected definition type " + type);
  }
}

export default function buildDefinitionTree(
  definitions: Definition[]
): DefinitionNode[] {
  const root: NodeMap = new Map();
  // Insert all definitions into the unparsed tree
  for (const definition of definitions) {
    const id = definition.identifier;
    assert(id.length > 1, "Illegal top-level definition found: " + id);
    const node = getOrCreateNodeAtPath(root, id);
    node.definition = definition;
  }

  const definitionTreeRoot: DefinitionNode[] = [];
  for (const node of root.values()) {
    definitionTreeRoot.push(parseNode(root, node));
  }
  return definitionTreeRoot;
}