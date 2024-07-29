const { z, ZodError } = require("zod");

class ZodCustomValidator {
  static customRefine(schema) {
    const validateField = (data, field, path, errors) => {
      if (
        (field instanceof z.ZodObject ||
          field instanceof z.ZodEffects ||
          field instanceof z.ZodOptional) &&
        data
      ) {
        if (field instanceof z.ZodEffects || field instanceof z.ZodOptional) {
          const nestedSchema = field._def.schema;
          const nestedInnerType = field._def.innerType;
          if (nestedSchema) {
            validateField(data, nestedSchema, path, errors);
          } else if (nestedInnerType) {
            validateField(data, nestedInnerType, path, errors);
          }
        } else if (field instanceof z.ZodObject) {
          for (const [nestedFieldName, nestedField] of Object.entries(
            field.shape
          )) {
            const nestedPath = [...path, nestedFieldName];
            validateField(
              data[nestedFieldName],
              nestedField,
              nestedPath,
              errors
            );
          }
        }
      } else if (
        field instanceof z.ZodArray &&
        !(field instanceof z.ZodOptional)
      ) {
        const arrayPath = [...path, "[]"];
        data.forEach((item, index) => {
          validateField(
            item,
            field._def.type,
            [...path, `[${index.toString()}]`],
            errors
          );
        });
      } else if (
        (field instanceof z.ZodString || field instanceof z.ZodNumber) &&
        !(field instanceof z.ZodOptional)
      ) {
        let value = data;
        if (field instanceof z.ZodString) {
          value = (value || "").trim();
        }

        if (value === undefined || value === null || value.length === 0) {
          errors.push({ message: `${path.join(".")} cannot be empty`, path });
        }
      }
    };

    return schema.refine((data) => {
      const errors = [];
      validateField(data, schema, [], errors);

      if (errors.length > 0) {
        throw new ZodError(errors);
      }

      return data;
    });
  }
}
module.exports = ZodCustomValidator;
