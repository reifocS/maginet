import * as React from "react";
import { joinClassNames } from "./classNames";

type FieldVariant = "win" | "unstyled";

const VARIANT_CLASS: Record<FieldVariant, string> = {
  win: "win-input",
  unstyled: "",
};

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: FieldVariant;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ variant = "win", className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={joinClassNames(VARIANT_CLASS[variant], className)}
        {...props}
      />
    );
  }
);

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: FieldVariant;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ variant = "win", className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={joinClassNames(VARIANT_CLASS[variant], className)}
        {...props}
      />
    );
  }
);

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  variant?: FieldVariant;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ variant = "win", className, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={joinClassNames(VARIANT_CLASS[variant], className)}
        {...props}
      />
    );
  }
);

export default Input;
