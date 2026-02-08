import * as React from "react";
import { joinClassNames } from "./classNames";

type ButtonVariant = "win" | "bevel" | "bevelRaised" | "unstyled";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  win: "win-button",
  bevel: "win-bevel cursor-pointer bg-win-button",
  bevelRaised: "win-bevel-raised cursor-pointer bg-win-button",
  unstyled: "",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export default function Button({
  variant = "win",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={joinClassNames(VARIANT_CLASS[variant], className)}
      {...props}
    />
  );
}
